package com.nikkitown.blocktown;

import android.content.Context;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceResponse;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Local-only resource overlay for the Capacitor WebView.
 *
 * The APK remains the baseline. An overlay is staged and hash-checked before
 * its active marker is replaced atomically, so a partial download cannot make
 * the app unbootable. A caller may use stagePackageDirectory(...) after it has
 * downloaded a package over an explicitly configured HTTPS channel; this
 * class never starts a network request on its own.
 */
public final class AndroidOverlayManager {
    public static final int SCHEMA = 1;
    public static final String PRODUCT = "nikki-block-town-android";

    private final File root;
    private final File versions;
    private final File activeMarker;
    private final File previousMarker;
    private final File stagedMarker;
    private final String embeddedVersion;
    private final PublicKey updatePublicKey;
    private final String updateKeyId;
    private File activeDirectory;
    private String activeVersion;
    private boolean activeFull = false;
    private Set<String> activePaths = new HashSet<>();
    private Set<String> activeRemoved = new HashSet<>();
    private String lastError = "";

    public synchronized String getLastError() { return lastError; }
    private boolean reject(String message) { lastError = message; return false; }

    public AndroidOverlayManager(Context context) {
        this(context, null, "");
    }

    /**
     * Creates a manager with the release public key pinned by the host app.
     * The default constructor deliberately has no key and therefore rejects
     * every signed package; production builds must pass the key explicitly.
     * The key is an X.509 SubjectPublicKeyInfo EC P-256 key, base64 encoded.
     */
    public AndroidOverlayManager(Context context, String publicKeyBase64, String keyId) {
        root = new File(context.getFilesDir(), "web-overlay");
        versions = new File(root, "versions");
        activeMarker = new File(root, "active.json");
        previousMarker = new File(root, "previous.json");
        stagedMarker = new File(root, "staged.json");
        embeddedVersion = packageVersion(context);
        updatePublicKey = parsePublicKey(publicKeyBase64);
        updateKeyId = keyId == null ? "" : keyId;
        loadActive();
    }

    /**
     * Returns the selected overlay file, or null when the embedded asset must
     * be used. Paths are URL-relative and are never allowed to escape the
     * selected version directory.
     */
    public synchronized File resolve(String urlPath) {
        if (activeDirectory == null || urlPath == null) return null;
        if (urlPath.equals("/")) urlPath = "index.html";
        String relative = normaliseRelativePath(urlPath);
        if (relative == null || activeRemoved.contains(relative) || !activePaths.contains(relative)) return null;
        try {
            File candidate = new File(activeDirectory, relative).getCanonicalFile();
            File base = activeDirectory.getCanonicalFile();
            if (!isInside(base, candidate) || !candidate.isFile()) return null;
            return candidate;
        } catch (IOException ignored) {
            return null;
        }
    }

    /**
     * Opens an overlay resource for WebView interception. Returning null lets
     * Capacitor's embedded asset server handle the request.
     */
    public synchronized WebResourceResponse open(String urlPath) {
        if ("/".equals(urlPath)) urlPath = "index.html";
        // These paths belong to Capacitor's native file/bridge server, not to
        // the signed game snapshot. Keep photo/file access working after OTA.
        String relative = normaliseRelativePath(urlPath);
        if (relative != null && (relative.startsWith("_capacitor_")
            || relative.equals("cordova.js") || relative.equals("cordova_plugins.js")
            || relative.equals("capacitor.js") || relative.startsWith("plugins/"))) return null;
        File file = resolve(urlPath);
        if (file == null) {
            if (activeDirectory != null && relative != null
                && (activeRemoved.contains(relative) || activeFull || activePaths.contains(relative))) {
                WebResourceResponse missing = new WebResourceResponse("text/plain", "UTF-8", new java.io.ByteArrayInputStream(new byte[0]));
                missing.setStatusCodeAndReasonPhrase(404, "Not Found");
                missing.setResponseHeaders(java.util.Collections.singletonMap("Cache-Control", "no-cache"));
                return missing;
            }
            return null;
        }
        try {
            String mime = mimeType(file.getName());
            WebResourceResponse response = new WebResourceResponse(
                mime,
                "UTF-8",
                new BufferedInputStream(new FileInputStream(file))
            );
            response.setResponseHeaders(java.util.Collections.singletonMap(
                "Cache-Control", "no-cache"
            ));
            return response;
        } catch (IOException ignored) {
            WebResourceResponse failed = new WebResourceResponse("text/plain", "UTF-8", new java.io.ByteArrayInputStream(new byte[0]));
            failed.setStatusCodeAndReasonPhrase(404, "Not Found");
            return failed;
        }
    }

    public synchronized String getActiveVersion() {
        // Report the resources actually served, never a stale or invalid
        // marker that loadActive() declined after an APK upgrade.
        return activeDirectory == null ? embeddedVersion : activeVersion;
    }

    /** Version currently served by the WebView, including the embedded APK baseline. */
    public synchronized String getCurrentVersion() { return getActiveVersion(); }

    private static String packageVersion(Context context) {
        try {
            String value = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName;
            return value == null || value.isEmpty() ? "0.0.0" : value;
        } catch (Exception ignored) { return "0.0.0"; }
    }

    /** Version downloaded and verified but intentionally not active yet. */
    public synchronized String getStagedVersion() {
        if (!stagedMarker.isFile()) return "";
        try {
            JSONObject staged = readJson(stagedMarker);
            return isStagedCompatible(staged) ? staged.optString("version", "") : "";
        }
        catch (Exception ignored) { return ""; }
    }

    public synchronized boolean hasActiveOverlay() {
        return activeDirectory != null && (!activePaths.isEmpty() || !activeRemoved.isEmpty());
    }

    /**
     * Stage a package directory containing manifest.json and the listed files.
     * The source directory is read-only from this method's perspective. The
     * package is copied into a private staging directory, verified, then moved
     * into versions/<version> and recorded as staged.json. Activation is a
     * separate explicit operation, so an interrupted download never changes
     * the resources currently served by the WebView.
     */
    public synchronized boolean stagePackageDirectory(File packageDirectory) {
        lastError = "";
        if (packageDirectory == null || !packageDirectory.isDirectory()) return reject("missing overlay package");
        try {
            File packageRoot = packageDirectory.getCanonicalFile();
            JSONObject manifest = readJson(new File(packageRoot, "manifest.json"));
            if (!hasValidManifestStructure(manifest)) return reject("invalid overlay manifest");
            if (!isBaselineCompatible(manifest)) return reject("overlay baseline mismatch");
            if (!verifyManifestSignature(manifest)) return reject("manifest signature rejected");
            String version = safeVersion(manifest.getString("version"));
            if (!isNewerThanEmbedded(version)) return reject("overlay version is not newer than installed APK");
            // Never replace the directory currently served by the WebView.
            if (version.equals(getCurrentVersion())) return reject("overlay version is already active");
            JSONArray files = manifest.getJSONArray("files");

            ensureDirectory(versions);
            File staging = new File(versions, ".staging-" + UUID.randomUUID().toString());
            ensureDirectory(staging);
            try {
                // 增量包只包含本次变化资源；先继承上一激活版本的覆盖文件，
                // 再应用本次文件和 remove，形成可独立回退的完整版本目录。
                boolean full = isFullManifest(manifest);
                if (!full && activeDirectory != null) copyTree(activeDirectory, staging);
                Set<String> effectivePaths = full ? new HashSet<>() : new HashSet<>(activePaths);
                Set<String> removedPaths = full ? new HashSet<>() : new HashSet<>(activeRemoved);
                JSONArray remove = manifest.optJSONArray("remove");
                if (remove != null) {
                    for (int i = 0; i < remove.length(); i++) {
                        String relative = normaliseRelativePath(remove.getString(i));
                        if (relative == null) throw new IOException("invalid remove path");
                        removedPaths.add(relative);
                    }
                }
                for (int i = 0; i < files.length(); i++) {
                    String relative = normaliseRelativePath(files.getJSONObject(i).getString("path"));
                    if (relative == null) throw new IOException("invalid overlay path");
                    effectivePaths.add(relative);
                    removedPaths.remove(relative);
                }
                for (String relative : removedPaths) {
                    effectivePaths.remove(relative);
                    File removed = new File(staging, relative).getCanonicalFile();
                    if (!isInside(staging.getCanonicalFile(), removed)) throw new IOException("remove path escaped staging");
                    if (removed.exists()) deleteTree(removed);
                }
                for (int i = 0; i < files.length(); i++) {
                    JSONObject item = files.getJSONObject(i);
                    String relative = normaliseRelativePath(item.getString("path"));
                    if (relative == null) throw new IOException("invalid overlay path");
                    File source = new File(packageRoot, relative).getCanonicalFile();
                    if (!isInside(packageRoot, source) || !source.isFile()) {
                        throw new IOException("missing overlay file");
                    }
                    File target = new File(staging, relative).getCanonicalFile();
                    if (!isInside(staging.getCanonicalFile(), target)) {
                        throw new IOException("overlay path escaped staging");
                    }
                    ensureDirectory(target.getParentFile());
                    copyFile(source, target);
                }
                if (!verifyFiles(staging, files)) throw new IOException("overlay hash mismatch");
                manifest.put("files", toFileArray(effectivePaths));
                manifest.put("remove", toJsonArray(removedPaths));
                // A delta over a full snapshot remains a complete snapshot.
                // This local marker field does not alter signed baseVersion.
                manifest.put("completeSnapshot", full || activeFull);

                File destination = new File(versions, version);
                if (destination.exists()) deleteTree(destination);
                moveAtomically(staging, destination);
                writeStagedAtomically(manifest, version);
                return true;
            } finally {
                if (staging.exists()) deleteTree(staging);
            }
        } catch (Exception error) {
            return reject(error.getMessage() == null ? "overlay staging failed" : error.getMessage());
        }
    }

    /** Activate the last fully staged package and reload the active marker. */
    public synchronized boolean activateStaged() {
        lastError = "";
        if (!stagedMarker.isFile()) return reject("no staged overlay");
        try {
            JSONObject staged = readJson(stagedMarker);
            if (!isStagedCompatible(staged)) return reject("staged overlay baseline or version mismatch");
            String version = safeVersion(staged.getString("version"));
            File directory = new File(versions, version).getCanonicalFile();
            if (!directory.isDirectory() || !isInside(versions.getCanonicalFile(), directory)) return reject("missing staged overlay files");
            if (activeDirectory != null && activeMarker.isFile()) copyFile(activeMarker, previousMarker);
            else {
                // The first overlay must also be able to roll back to the
                // APK's embedded resources, which have no versions directory.
                JSONObject embedded = new JSONObject();
                embedded.put("embedded", true);
                embedded.put("version", embeddedVersion);
                writeJson(previousMarker, embedded);
            }
            moveAtomically(stagedMarker, activeMarker);
            loadActive();
            return true;
        } catch (Exception error) { return reject(error.getMessage() == null ? "overlay activation failed" : error.getMessage()); }
    }

    /**
     * Roll back to the marker saved immediately before the current activation.
     * The failed version remains on disk for diagnostics and a later retry.
     */
    public synchronized boolean rollback() {
        if (!previousMarker.isFile()) return false;
        try {
            JSONObject previous = readJson(previousMarker);
            if (previous.optBoolean("embedded", false)) {
                if (!embeddedVersion.equals(previous.optString("version", ""))) return false;
                if (activeMarker.exists() && !activeMarker.delete()) return false;
                previousMarker.delete();
                if (stagedMarker.exists()) stagedMarker.delete();
                loadActive();
                return true;
            }
            String version = safeVersion(previous.getString("version"));
            File directory = new File(versions, version).getCanonicalFile();
            if (!directory.isDirectory()) return false;
            moveAtomically(previousMarker, activeMarker);
            if (stagedMarker.exists()) stagedMarker.delete();
            loadActive();
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    /** Verifies the signed manifest before any network files are downloaded. */
    public synchronized boolean verifyManifestSignature(JSONObject manifest) {
        if (manifest == null || updatePublicKey == null) return false;
        try {
            JSONObject signature = manifest.getJSONObject("signature");
            if (!"ECDSA-P256-SHA256".equals(signature.optString("algorithm", ""))) return false;
            if (!updateKeyId.isEmpty() && !updateKeyId.equals(signature.optString("keyId", ""))) return false;
            String value = signature.optString("value", "");
            if (value.isEmpty()) return false;
            byte[] encoded = android.util.Base64.decode(value, android.util.Base64.DEFAULT);
            Signature verifier = Signature.getInstance("SHA256withECDSA");
            verifier.initVerify(updatePublicKey);
            verifier.update(canonicalPayload(manifest).getBytes(StandardCharsets.UTF_8));
            return verifier.verify(encoded);
        } catch (Exception ignored) {
            return false;
        }
    }

    /** Returns a parsed X.509 EC public key, or null for an unconfigured app. */
    public static PublicKey parsePublicKey(String publicKeyBase64) {
        if (publicKeyBase64 == null || publicKeyBase64.trim().isEmpty()) return null;
        try {
            byte[] encoded = android.util.Base64.decode(publicKeyBase64.trim(), android.util.Base64.DEFAULT);
            PublicKey key = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(encoded));
            if (!"EC".equalsIgnoreCase(key.getAlgorithm())) return null;
            return key;
        } catch (Exception ignored) {
            return null;
        }
    }

    private void loadActive() {
        activeDirectory = null;
        activeVersion = null;
        activeFull = false;
        activePaths = new HashSet<>();
        activeRemoved = new HashSet<>();
        if (!activeMarker.isFile()) return;
        try {
            JSONObject marker = readJson(activeMarker);
            String version = safeVersion(marker.getString("version"));
            // Full APK upgrades win over equal/older downloaded resources.
            // Leave every marker and version directory intact so an explicit
            // APK rollback can still use its previous verified overlay.
            if (!isNewerThanEmbedded(version)) return;
            File candidate = new File(versions, version).getCanonicalFile();
            if (!candidate.isDirectory() || !isInside(versions.getCanonicalFile(), candidate)) return;
            JSONArray files = marker.optJSONArray("files");
            if (files == null) return;
            Set<String> paths = new HashSet<>();
            for (int i = 0; i < files.length(); i++) {
                // Older managers wrote strings here; accept those existing
                // local markers while new markers consistently use objects.
                JSONObject item = files.optJSONObject(i);
                String relative = normaliseRelativePath(item == null ? files.optString(i, "") : item.optString("path", ""));
                if (relative == null) return;
                paths.add(relative);
            }
            Set<String> removedPaths = new HashSet<>();
            JSONArray removed = marker.optJSONArray("remove");
            if (removed != null) {
                for (int i = 0; i < removed.length(); i++) {
                    String relative = normaliseRelativePath(removed.getString(i));
                    if (relative == null) return;
                    removedPaths.add(relative);
                }
            }
            activeDirectory = candidate;
            activeVersion = version;
            activeFull = marker.optBoolean("completeSnapshot", isFullManifest(marker));
            activePaths = paths;
            activeRemoved = removedPaths;
        } catch (Exception ignored) {
            // A malformed marker never displaces the embedded APK assets.
        }
    }

    private boolean isNewerThanEmbedded(String version) {
        if (safeVersion(version) == null) return false;
        Integer comparison = compareReleaseVersions(version, embeddedVersion);
        return comparison == null || comparison > 0;
    }

    private boolean isStagedCompatible(JSONObject marker) {
        String version = marker.optString("version", "");
        if (!isNewerThanEmbedded(version) || version.equals(getCurrentVersion())) return false;
        // Android optString(JSON null) is the literal string "null", unlike
        // desktop org.json. Preserve full-snapshot semantics explicitly.
        if (isFullManifest(marker)) return true;
        String base = marker.optString("baseVersion", "");
        return base.isEmpty() || base.equals(getCurrentVersion());
    }

    // Match the desktop updater's numeric release ordering; development labels
    // keep the previous behavior instead of being ordered lexicographically.
    static Integer compareReleaseVersions(String left, String right) {
        if (left == null || right == null || !left.matches("[0-9]+(\\.[0-9]+)*") || !right.matches("[0-9]+(\\.[0-9]+)*")) return null;
        String[] a = left.split("\\."), b = right.split("\\.");
        for (int i = 0; i < Math.max(a.length, b.length); i++) {
            java.math.BigInteger x = new java.math.BigInteger(i < a.length ? a[i] : "0");
            java.math.BigInteger y = new java.math.BigInteger(i < b.length ? b[i] : "0");
            int order = x.compareTo(y);
            if (order != 0) return order;
        }
        return 0;
    }

    private void writeActiveAtomically(JSONObject manifest, String version) throws IOException {
        ensureDirectory(root);
        if (activeMarker.isFile()) {
            copyFile(activeMarker, previousMarker);
        }
        JSONObject marker = new JSONObject();
        try {
            marker.put("schema", SCHEMA);
            marker.put("product", PRODUCT);
            marker.put("version", version);
            marker.put("baseVersion", isFullManifest(manifest) ? JSONObject.NULL : manifest.getString("baseVersion"));
            marker.put("completeSnapshot", manifest.optBoolean("completeSnapshot", isFullManifest(manifest)));
            marker.put("files", manifest.getJSONArray("files"));
            marker.put("remove", manifest.optJSONArray("remove") == null ? new JSONArray() : manifest.getJSONArray("remove"));
        } catch (Exception e) {
            throw new IOException("cannot create active marker", e);
        }
        File temporary = new File(root, "active.json.tmp");
        writeJson(temporary, marker);
        moveAtomically(temporary, activeMarker);
    }

    private void writeStagedAtomically(JSONObject manifest, String version) throws IOException {
        ensureDirectory(root);
        JSONObject marker = new JSONObject();
        try {
            marker.put("schema", SCHEMA);
            marker.put("product", PRODUCT);
            marker.put("version", version);
            marker.put("baseVersion", isFullManifest(manifest) ? JSONObject.NULL : manifest.getString("baseVersion"));
            marker.put("completeSnapshot", manifest.optBoolean("completeSnapshot", isFullManifest(manifest)));
            marker.put("files", manifest.getJSONArray("files"));
            marker.put("remove", manifest.optJSONArray("remove") == null ? new JSONArray() : manifest.getJSONArray("remove"));
        } catch (Exception e) { throw new IOException("cannot create staged marker", e); }
        File temporary = new File(root, "staged.json.tmp");
        writeJson(temporary, marker);
        moveAtomically(temporary, stagedMarker);
    }

    static boolean isFullManifest(JSONObject manifest) {
        return manifest != null && (!manifest.has("baseVersion") || manifest.isNull("baseVersion"));
    }

    boolean isBaselineCompatible(JSONObject manifest) {
        return manifest != null && (isFullManifest(manifest) || getCurrentVersion().equals(manifest.optString("baseVersion", "")));
    }

    boolean isValidManifest(JSONObject manifest) {
        return hasValidManifestStructure(manifest) && isBaselineCompatible(manifest);
    }

    boolean hasValidManifestStructure(JSONObject manifest) {
        if (manifest == null || manifest.optInt("schema", -1) != SCHEMA) return false;
        if (!PRODUCT.equals(manifest.optString("product", ""))) return false;
        String version = manifest.optString("version", "");
        if (safeVersion(version) == null) return false;
        if (!isFullManifest(manifest) && safeVersion(manifest.optString("baseVersion", "")) == null) return false;
        JSONArray files = manifest.optJSONArray("files");
        JSONArray remove = manifest.optJSONArray("remove");
        if (files == null || (files.length() == 0 && (remove == null || remove.length() == 0))) return false;
        if (isFullManifest(manifest) && files.length() == 0) return false;
        Set<String> paths = new HashSet<>();
        long total = 0L;
        for (int i = 0; i < files.length(); i++) {
            JSONObject item = files.optJSONObject(i);
            if (item == null) return false;
            String path = item.optString("path", "");
            String relative = normaliseRelativePath(path);
            if (relative == null || !relative.equals(path) || !paths.add(relative)) return false;
            String hash = item.optString("sha256", "").toLowerCase();
            if (!hash.matches("[0-9a-f]{64}")) return false;
            long size = item.optLong("size", -1L);
            if (size < 0L || size > AndroidOverlayDownloader.MAX_FILE_BYTES
                || total > AndroidOverlayDownloader.MAX_PACKAGE_BYTES - size) return false;
            total += size;
            if (item.has("url")) {
                try {
                    Object value = item.get("url");
                    if (!(value instanceof String)) return false;
                    java.net.URL url = new java.net.URL((String) value);
                    if (!"https".equalsIgnoreCase(url.getProtocol()) || url.getHost().isEmpty()
                        || url.getUserInfo() != null || url.getRef() != null) return false;
                } catch (Exception ignored) { return false; }
            }
        }
        Set<String> removed = new HashSet<>();
        if (remove != null) {
            for (int i = 0; i < remove.length(); i++) {
                String path = remove.optString(i, "");
                String relative = normaliseRelativePath(path);
                if (relative == null || !relative.equals(path) || paths.contains(relative) || !removed.add(relative)) return false;
            }
        }
        return true;
    }

    private static boolean verifyFiles(File root, JSONArray files) throws Exception {
        for (int i = 0; i < files.length(); i++) {
            JSONObject item = files.getJSONObject(i);
            String relative = normaliseRelativePath(item.getString("path"));
            if (relative == null) return false;
            File file = new File(root, relative).getCanonicalFile();
            if (!isInside(root.getCanonicalFile(), file) || !file.isFile()) return false;
            if (item.has("size") && item.getLong("size") != file.length()) return false;
            String expected = item.optString("sha256", "").toLowerCase();
            if (!expected.matches("[0-9a-f]{64}") || !expected.equals(sha256(file))) return false;
        }
        return true;
    }

    static String normaliseRelativePath(String path) {
        if (path == null) return null;
        String value = path.replace('\\', '/');
        while (value.startsWith("/")) value = value.substring(1);
        if (value.isEmpty() || value.contains("\0")) return null;
        String[] parts = value.split("/");
        StringBuilder result = new StringBuilder();
        for (String part : parts) {
            if (part.isEmpty() || ".".equals(part) || "..".equals(part)) return null;
            if (result.length() > 0) result.append('/');
            result.append(part);
        }
        return result.toString();
    }

    private static String canonicalPayload(JSONObject manifest) {
        return canonicalValue(manifest, true);
    }

    private static String canonicalValue(Object value, boolean root) {
        if (value == JSONObject.NULL || value == null) return "null";
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            List<String> keys = new ArrayList<>();
            Iterator<String> iterator = object.keys();
            while (iterator.hasNext()) {
                String key = iterator.next();
                if (root && "signature".equals(key)) continue;
                keys.add(key);
            }
            Collections.sort(keys);
            StringBuilder result = new StringBuilder("{");
            for (int i = 0; i < keys.size(); i++) {
                if (i > 0) result.append(',');
                String key = keys.get(i);
                result.append(canonicalString(key)).append(':').append(canonicalValue(object.opt(key), false));
            }
            return result.append('}').toString();
        }
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            StringBuilder result = new StringBuilder("[");
            for (int i = 0; i < array.length(); i++) {
                if (i > 0) result.append(',');
                result.append(canonicalValue(array.opt(i), false));
            }
            return result.append(']').toString();
        }
        if (value instanceof String || value instanceof Character) return canonicalString(String.valueOf(value));
        if (value instanceof Boolean) return String.valueOf(value);
        if (value instanceof Number) {
            // Protocol numbers are schema identifiers and byte counts, all safe
            // integers in the Node publisher. Reject ambiguous floating-point
            // extensions rather than sign different bytes across runtimes.
            java.math.BigInteger integer;
            try { integer = new java.math.BigDecimal(String.valueOf(value)).toBigIntegerExact(); }
            catch (NumberFormatException | ArithmeticException error) { throw new IllegalArgumentException("non-integer manifest number", error); }
            if (integer.abs().compareTo(java.math.BigInteger.valueOf(9007199254740991L)) > 0) {
                throw new IllegalArgumentException("unsafe manifest number");
            }
            return integer.toString();
        }
        throw new IllegalArgumentException("unsupported manifest value");
    }

    /** JSON.stringify-compatible strings, independent of Android org.json.
     * In particular '/' is never escaped; lone UTF-16 surrogates are escaped,
     * while valid pairs and U+2028/U+2029 remain unchanged like modern Node.
     */
    private static String canonicalString(String value) {
        StringBuilder result = new StringBuilder("\"");
        final char[] hex = "0123456789abcdef".toCharArray();
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"': result.append("\\\""); break;
                case '\\': result.append("\\\\"); break;
                case '\b': result.append("\\b"); break;
                case '\f': result.append("\\f"); break;
                case '\n': result.append("\\n"); break;
                case '\r': result.append("\\r"); break;
                case '\t': result.append("\\t"); break;
                default:
                    boolean loneSurrogate = Character.isHighSurrogate(c)
                        ? i + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(i + 1))
                        : Character.isLowSurrogate(c) && (i == 0 || !Character.isHighSurrogate(value.charAt(i - 1)));
                    if (c < 0x20 || loneSurrogate) {
                        result.append("\\u").append(hex[(c >>> 12) & 15]).append(hex[(c >>> 8) & 15])
                            .append(hex[(c >>> 4) & 15]).append(hex[c & 15]);
                    } else result.append(c);
            }
        }
        return result.append('"').toString();
    }

    private static String safeVersion(String version) {
        if (version == null || version.isEmpty() || version.length() > 96 || version.equals(".") || version.equals("..")) return null;
        for (int i = 0; i < version.length(); i++) {
            char c = version.charAt(i);
            if (!(Character.isLetterOrDigit(c) || c == '.' || c == '-' || c == '_')) return null;
        }
        return version;
    }

    private static boolean isInside(File parent, File child) throws IOException {
        String p = parent.getCanonicalPath();
        String c = child.getCanonicalPath();
        return c.equals(p) || c.startsWith(p + File.separator);
    }

    private static void ensureDirectory(File directory) throws IOException {
        if (directory == null) throw new IOException("missing directory");
        if (!directory.isDirectory() && !directory.mkdirs() && !directory.isDirectory()) {
            throw new IOException("cannot create directory");
        }
    }

    private static JSONArray toJsonArray(Set<String> values) {
        JSONArray array = new JSONArray();
        java.util.ArrayList<String> sorted = new java.util.ArrayList<>(values);
        java.util.Collections.sort(sorted);
        for (String value : sorted) array.put(value);
        return array;
    }

    private static JSONArray toFileArray(Set<String> values) throws Exception {
        JSONArray array = new JSONArray();
        java.util.ArrayList<String> sorted = new java.util.ArrayList<>(values);
        java.util.Collections.sort(sorted);
        for (String value : sorted) array.put(new JSONObject().put("path", value));
        return array;
    }

    private static void copyTree(File source, File destination) throws IOException {
        File[] children = source.listFiles();
        if (children == null) return;
        for (File child : children) {
            File target = new File(destination, child.getName());
            if (child.isDirectory()) {
                ensureDirectory(target);
                copyTree(child, target);
            } else if (child.isFile()) {
                ensureDirectory(target.getParentFile());
                copyFile(child, target);
            }
        }
    }

    private static void copyFile(File source, File destination) throws IOException {
        try (InputStream input = new BufferedInputStream(new FileInputStream(source));
             OutputStream output = new BufferedOutputStream(new FileOutputStream(destination))) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        }
    }

    private static void moveAtomically(File source, File destination) throws IOException {
        ensureDirectory(destination.getParentFile());
        // renameTo is an atomic same-filesystem rename on Android app storage.
        // The fallback is only for unusual filesystems that reject replacement.
        if (source.renameTo(destination)) return;
        if (destination.exists() && !destination.delete()) throw new IOException("cannot replace destination");
        if (!source.renameTo(destination)) throw new IOException("cannot activate overlay");
    }

    private static JSONObject readJson(File file) throws Exception {
        byte[] bytes;
        try (InputStream input = new BufferedInputStream(new FileInputStream(file))) {
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[16 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            bytes = output.toByteArray();
        }
        return new JSONObject(new String(bytes, StandardCharsets.UTF_8));
    }

    private static void writeJson(File file, JSONObject value) throws IOException {
        try (OutputStream output = new BufferedOutputStream(new FileOutputStream(file))) {
            output.write(value.toString().getBytes(StandardCharsets.UTF_8));
            output.flush();
        } catch (Exception e) {
            throw new IOException("cannot write marker", e);
        }
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        byte[] bytes = digest.digest();
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format("%02x", value & 0xff));
        return result.toString();
    }

    private static String mimeType(String name) {
        String extension = MimeTypeMap.getFileExtensionFromUrl(name);
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        if (mime != null) return mime;
        if (name.endsWith(".js")) return "text/javascript";
        if (name.endsWith(".css")) return "text/css";
        if (name.endsWith(".json")) return "application/json";
        if (name.endsWith(".html")) return "text/html";
        return "application/octet-stream";
    }

    private static void deleteTree(File file) throws IOException {
        if (!file.exists()) return;
        File canonical = file.getCanonicalFile();
        File[] children = canonical.listFiles();
        if (children != null) {
            for (File child : children) deleteTree(child);
        }
        if (!canonical.delete() && canonical.exists()) throw new IOException("cannot delete staging file");
    }
}
