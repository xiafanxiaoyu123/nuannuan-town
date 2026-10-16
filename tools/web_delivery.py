"""Optional official download/CDN URL map; local paths remain release inputs.

Maps are deployment inputs, never guessed URLs.  Their size/hash must describe
the current immutable local file, so an old cloud link cannot silently attach
itself to a newly built package.  No credentials belong in this file.
"""
import json
import re
from urllib.parse import urlsplit


def read_delivery_map(path, version):
    if not path:
        return {}
    with open(path, encoding='utf-8') as stream:
        value = json.load(stream)
    if not isinstance(value, dict) or value.get('schema') != 1:
        raise ValueError('delivery map schema must be 1')
    if str(value.get('version', '')) != str(version):
        raise ValueError('delivery map version does not match this release')
    downloads = value.get('downloads', {})
    if not isinstance(downloads, dict) or set(downloads) - {'android', 'windows'}:
        raise ValueError('delivery map downloads only supports android/windows package links')
    return value


def local_asset_path(value):
    if not isinstance(value, str) or not re.fullmatch(
            r'assets/[A-Za-z0-9_.-]+\.(?:js|css)', value):
        raise ValueError('web sourcePath must be a local assets JS/CSS file')
    return value


def https_url(value):
    if not isinstance(value, str) or any(c.isspace() for c in value):
        raise ValueError('delivery URL must be an absolute HTTPS URL')
    parts = urlsplit(value)
    if parts.scheme != 'https' or not parts.hostname or parts.username or parts.password or parts.fragment:
        raise ValueError('delivery URL must be credential-free HTTPS without a fragment')
    # Trigger validation of a malformed port, too.
    _ = parts.port
    return value


def verified_mapping(item, digest, size):
    if not isinstance(item, dict):
        raise ValueError('delivery map item must be an object')
    if item.get('sha256') != digest or item.get('sizeBytes') != size:
        raise ValueError('delivery map SHA-256/sizeBytes differs from the current file')
    return https_url(item.get('url'))


def map_web_resources(manifest, delivery):
    """Apply only explicit, externally tested CORS links; retain local fallback."""
    mapping = delivery.get('web', {})
    if not isinstance(mapping, dict):
        raise ValueError('delivery map web must be an object')
    resources = manifest.get('resources', [])
    paths = {local_asset_path(item.get('sourcePath') or item.get('url')) for item in resources}
    if set(mapping) - paths:
        raise ValueError('delivery map contains a web path outside this build')
    for item in resources:
        source = local_asset_path(item.get('sourcePath') or item['url'])
        item['sourcePath'] = source
        item['fallbackUrl'] = source
        if source in mapping:
            entry = mapping[source]
            if not isinstance(entry, dict) or entry.get('corsVerified') is not True:
                raise ValueError('external web resources require an actual CORS/MIME/SRI probe before enabling')
            item['url'] = verified_mapping(entry, item['sha256'], item['size'])
    return manifest


def package_delivery(platform, local_url, digest, size, version, delivery):
    result = {'url': local_url, 'mirrors': [], 'version': str(version), 'sizeBytes': size}
    mapping = delivery.get('downloads', {})
    if not isinstance(mapping, dict):
        raise ValueError('delivery map downloads must be an object')
    item = mapping.get(platform)
    if item is None:
        return result
    result['url'] = verified_mapping(item, digest, size)
    mirrors = item.get('mirrors', [])
    if not isinstance(mirrors, list):
        raise ValueError('download mirrors must be a list')
    result['mirrors'] = list(dict.fromkeys([https_url(url) for url in mirrors] + [local_url]))
    result['mirrors'] = [url for url in result['mirrors'] if url != result['url']]
    return result
