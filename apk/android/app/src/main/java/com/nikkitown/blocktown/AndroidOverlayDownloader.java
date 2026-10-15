package com.nikkitown.blocktown;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLConnection;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import javax.net.ssl.HttpsURLConnection;

/**
 * Discovery and signed manifests stay on the configured update origin. Only
 * a signature-verified file entry may select an external HTTPS delivery URL.
 * Redirects cannot downgrade to HTTP. Signature, size and SHA-256 checks still
 * precede staging; activation remains an explicit user decision.
 */
public final class AndroidOverlayDownloader {
    public static final long MAX_MANIFEST_BYTES = 2L * 1024L * 1024L;
    public static final long MAX_FILE_BYTES = 128L * 1024L * 1024L;
    public static final long MAX_PACKAGE_BYTES = 256L * 1024L * 1024L;
    private static final int MAX_REDIRECTS = 5;
    private static final int MAX_DOWNLOAD_ATTEMPTS = 3;
    private final Context context;
    private final AndroidOverlayManager manager;
    private volatile String lastError = "";

    public AndroidOverlayDownloader(Context context, AndroidOverlayManager manager) {
        this.context = context.getApplicationContext(); this.manager = manager;
    }
    public String getLastError() { return lastError; }

    /** Fetch and verify a compatible signed manifest without downloading files. */
    public JSONObject check(URL manifestUrl) {
        lastError = "";
        try {
            FetchedManifest fetched = fetchManifest(manifestUrl);
            if (!manager.isBaselineCompatible(fetched.manifest)) throw new IOException("overlay baseline mismatch");
            return fetched.manifest;
        } catch (Exception error) { recordError(error); return null; }
    }
    public JSONObject checkLatest(URL latestUrl) {
        lastError = "";
        try { return selectLatest(latestUrl).manifest; }
        catch (Exception error) { recordError(error); return null; }
    }
    /** Downloads and stages a signed manifest. Must run off the UI thread. */
    public boolean update(URL manifestUrl) {
        lastError = "";
        try {
            FetchedManifest fetched = fetchManifest(manifestUrl);
            if (!manager.isBaselineCompatible(fetched.manifest)) throw new IOException("overlay baseline mismatch");
            return stageManifest(fetched);
        } catch (Exception error) { recordError(error); return false; }
    }
    public boolean updateLatest(URL latestUrl) {
        lastError = "";
        try { return stageManifest(selectLatest(latestUrl)); }
        catch (Exception error) { recordError(error); return false; }
    }
    private void recordError(Exception error) {
        lastError = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
    }
    private static final class FetchedManifest {
        final URL url; final byte[] bytes; final JSONObject manifest;
        FetchedManifest(URL url, byte[] bytes, JSONObject manifest) {
            this.url = url; this.bytes = bytes; this.manifest = manifest;
        }
    }
    private FetchedManifest fetchManifest(URL url) throws Exception {
        byte[] bytes = readBytes(openHttps(url, false), MAX_MANIFEST_BYTES);
        JSONObject manifest = new JSONObject(new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
        if (!manager.hasValidManifestStructure(manifest)) throw new IOException("invalid overlay manifest");
        if (!manager.verifyManifestSignature(manifest)) throw new IOException("manifest signature rejected");
        return new FetchedManifest(url, bytes, manifest);
    }
    private FetchedManifest selectLatest(URL latestUrl) throws Exception {
        JSONObject metadata = readJsonObject(latestUrl);
        FetchedManifest primary = fetchManifest(resolveManifestUrl(latestUrl, metadata, "manifestUrl"));
        String advertised = metadata.optString("version", "");
        if (!advertised.isEmpty() && !advertised.equals(primary.manifest.optString("version", ""))) {
            throw new IOException("update metadata version mismatch");
        }
        if (manager.isBaselineCompatible(primary.manifest)) return primary;
        if (metadata.optString("fullManifestUrl", "").isEmpty()) throw new IOException("overlay baseline mismatch");
        FetchedManifest full = fetchManifest(resolveManifestUrl(latestUrl, metadata, "fullManifestUrl"));
        if (!AndroidOverlayManager.isFullManifest(full.manifest)
            || !primary.manifest.getString("version").equals(full.manifest.optString("version", ""))) {
            throw new IOException("full overlay fallback mismatch");
        }
        return full;
    }
    private JSONObject readJsonObject(URL url) throws Exception {
        byte[] bytes = readBytes(openHttps(url, false), MAX_MANIFEST_BYTES);
        JSONObject metadata = new JSONObject(new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
        if (!"nikki-block-town-android".equals(metadata.optString("product", ""))) {
            throw new IOException("update metadata product mismatch");
        }
        return metadata;
    }
    private URL resolveManifestUrl(URL latestUrl, JSONObject metadata, String field) throws Exception {
        String value = metadata.optString(field, "");
        if (value.isEmpty()) throw new IOException("update metadata missing " + field);
        URL resolved = new URL(latestUrl, value); requireHttps(resolved);
        if (!sameOrigin(latestUrl, resolved)) throw new IOException("update manifest origin mismatch");
        return resolved;
    }
    private boolean stageManifest(FetchedManifest fetched) throws Exception {
        File packageDirectory = null;
        try {
            packageDirectory = new File(context.getCacheDir(), "overlay-download-" + UUID.randomUUID());
            if (!packageDirectory.mkdirs()) throw new IOException("cannot create download directory");
            writeBytes(new File(packageDirectory, "manifest.json"), fetched.bytes);
            JSONArray files = fetched.manifest.getJSONArray("files"); long total = 0L;
            for (int i = 0; i < files.length(); i++) {
                JSONObject item = files.getJSONObject(i);
                String relative = AndroidOverlayManager.normaliseRelativePath(item.getString("path"));
                if (relative == null) throw new IOException("invalid overlay path");
                long size = item.optLong("size", -1L);
                if (size < 0L || size > MAX_FILE_BYTES || total > MAX_PACKAGE_BYTES - size) throw new IOException("overlay package too large");
                URL fileUrl = resolveFileUrl(fetched.url, relative, item);
                File target = new File(packageDirectory, relative).getCanonicalFile();
                if (!target.getPath().startsWith(packageDirectory.getCanonicalPath() + File.separator)) throw new IOException("overlay path escaped package");
                File parent = target.getParentFile();
                if (parent != null && !parent.isDirectory() && !parent.mkdirs() && !parent.isDirectory()) throw new IOException("cannot create package path");
                downloadWithRetry(fileUrl, target, size); total += size;
            }
            if (!manager.stagePackageDirectory(packageDirectory)) {
                String reason = manager.getLastError();
                throw new IOException(reason.isEmpty() ? "overlay staging rejected" : reason);
            }
            return true;
        } finally { if (packageDirectory != null) deleteTree(packageDirectory); }
    }
    private static URL resolveFileUrl(URL manifestUrl, String relative, JSONObject item) throws Exception {
        if (!item.has("url")) return sameOriginUrl(manifestUrl, relative);
        // Absolute URL only. This field is part of the signed payload.
        URL resolved = new URL(item.getString("url")); requireHttps(resolved); return resolved;
    }
    private static URL sameOriginUrl(URL manifestUrl, String relative) throws Exception {
        URL resolved = new URL(manifestUrl, relative); requireHttps(resolved);
        if (!sameOrigin(manifestUrl, resolved)) throw new IOException("overlay file origin mismatch");
        return resolved;
    }
    private static boolean sameOrigin(URL left, URL right) {
        int leftPort = left.getPort() < 0 ? left.getDefaultPort() : left.getPort();
        int rightPort = right.getPort() < 0 ? right.getDefaultPort() : right.getPort();
        return left.getHost().equalsIgnoreCase(right.getHost()) && leftPort == rightPort;
    }
    private static URLConnection openHttps(URL url, boolean allowCrossOriginRedirects) throws IOException {
        requireHttps(url); URL current = url; Set<String> visited = new HashSet<>();
        for (int redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
            if (!visited.add(current.toExternalForm())) throw new IOException("download redirect loop");
            URLConnection opened = current.openConnection();
            if (!(opened instanceof HttpsURLConnection)) throw new IOException("overlay updates require HTTPS");
            HttpsURLConnection connection = (HttpsURLConnection) opened;
            connection.setConnectTimeout(12_000); connection.setReadTimeout(30_000);
            connection.setInstanceFollowRedirects(false); connection.setRequestMethod("GET");
            connection.setRequestProperty("Accept", "application/json, application/octet-stream");
            connection.setRequestProperty("Accept-Encoding", "identity");
            int status;
            try { status = connection.getResponseCode(); }
            catch (IOException error) { connection.disconnect(); throw error; }
            if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                String location = connection.getHeaderField("Location"); connection.disconnect();
                if (redirects == MAX_REDIRECTS || location == null || location.trim().isEmpty()) throw new IOException("download redirect limit or missing location");
                URL next = new URL(current, location); requireHttps(next);
                if (!allowCrossOriginRedirects && !sameOrigin(url, next)) throw new IOException("update manifest redirect origin mismatch");
                current = next; continue;
            }
            // No Range was requested; partial responses cannot form a package.
            if (status != 200) { connection.disconnect(); throw new IOException("download HTTP " + status); }
            return connection;
        }
        throw new IOException("download redirect limit");
    }
    private static void downloadWithRetry(URL url, File target, long expectedSize) throws Exception {
        for (int attempt = 0; attempt < MAX_DOWNLOAD_ATTEMPTS; attempt++) {
            try { downloadTo(url, target, expectedSize); return; }
            catch (IOException error) {
                if (target.exists()) target.delete();
                if (attempt + 1 == MAX_DOWNLOAD_ATTEMPTS) throw error;
                Thread.sleep(250L * (attempt + 1));
            }
        }
    }
    private static void downloadTo(URL url, File target, long expectedSize) throws Exception {
        URLConnection connection = openHttps(url, true); long written = 0L;
        try {
            long declared = connection.getContentLengthLong();
            if (declared >= 0L && declared != expectedSize) throw new IOException("resource size mismatch");
            try (InputStream input = new BufferedInputStream(connection.getInputStream());
                 java.io.OutputStream output = new BufferedOutputStream(new FileOutputStream(target))) {
                byte[] buffer = new byte[64 * 1024]; int count;
                while ((count = input.read(buffer)) != -1) {
                    written += count;
                    if (written > expectedSize || written > MAX_FILE_BYTES) throw new IOException("resource too large");
                    output.write(buffer, 0, count);
                }
            }
        } finally { if (connection instanceof HttpURLConnection) ((HttpURLConnection) connection).disconnect(); }
        if (written != expectedSize) throw new IOException("resource truncated");
    }
    private static byte[] readBytes(URLConnection connection, long maxBytes) throws Exception {
        try {
            if (connection.getContentLengthLong() > maxBytes) throw new IOException("manifest too large");
            try (InputStream input = new BufferedInputStream(connection.getInputStream());
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[16 * 1024]; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (output.size() + count > maxBytes) throw new IOException("manifest too large");
                    output.write(buffer, 0, count);
                }
                return output.toByteArray();
            }
        } finally { if (connection instanceof HttpURLConnection) ((HttpURLConnection) connection).disconnect(); }
    }
    private static void writeBytes(File file, byte[] bytes) throws IOException {
        File parent = file.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs() && !parent.isDirectory()) throw new IOException("cannot create package directory");
        try (java.io.OutputStream output = new BufferedOutputStream(new FileOutputStream(file))) { output.write(bytes); }
    }
    private static void requireHttps(URL url) throws IOException {
        if (url == null || !"https".equalsIgnoreCase(url.getProtocol()) || url.getHost().isEmpty()
            || url.getUserInfo() != null || url.getRef() != null) {
            throw new IOException("overlay updates require HTTPS without credentials or fragments");
        }
    }
    private static void deleteTree(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteTree(child);
        // Only the private cache package is disposable; cleanup cannot mask a result.
        file.delete();
    }
}
