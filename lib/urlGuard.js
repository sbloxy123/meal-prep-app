// SSRF guard for server-side URL fetching (recipe import). We only ever fetch
// user-supplied URLs, so before fetching we: (1) require http/https, and (2)
// resolve the hostname and reject if it points at a loopback/private/link-local
// address — blocking access to localhost, internal services and cloud metadata
// endpoints (e.g. 169.254.169.254). Called again on every redirect hop.
const dns = require("node:dns").promises;
const net = require("node:net");

// Parse an IPv4 address to its 32-bit integer, or null if not IPv4.
function ipv4ToInt(ip) {
    const parts = ip.split(".");
    if (parts.length !== 4) return null;
    let value = 0;
    for (const part of parts) {
        const n = Number(part);
        if (!Number.isInteger(n) || n < 0 || n > 255) return null;
        value = value * 256 + n;
    }
    return value >>> 0;
}

function isPrivateIPv4(ip) {
    const n = ipv4ToInt(ip);
    if (n === null) return false;
    const inRange = (base, bits) => {
        const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
        return (n & mask) === (ipv4ToInt(base) & mask);
    };
    return (
        inRange("0.0.0.0", 8) || // "this" network / 0.0.0.0
        inRange("10.0.0.0", 8) ||
        inRange("100.64.0.0", 10) || // CGNAT
        inRange("127.0.0.0", 8) || // loopback
        inRange("169.254.0.0", 16) || // link-local (incl. cloud metadata)
        inRange("172.16.0.0", 12) ||
        inRange("192.168.0.0", 16)
    );
}

function isPrivateIPv6(ip) {
    const addr = ip.toLowerCase().split("%")[0]; // strip zone id
    if (addr === "::1" || addr === "::") return true; // loopback / unspecified
    if (addr.startsWith("fe80")) return true; // link-local
    if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // unique local fc00::/7
    // IPv4-mapped IPv6 (::ffff:a.b.c.d) — check the embedded IPv4.
    const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIPv4(mapped[1]);
    return false;
}

function isPrivateAddress(ip) {
    return net.isIPv4(ip) ? isPrivateIPv4(ip) : isPrivateIPv6(ip);
}

// Validate a URL string for safe server-side fetching. Throws an Error (with a
// user-facing message) if the URL is unsafe; returns the parsed URL otherwise.
async function assertSafeUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new Error("Invalid URL");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Only http and https URLs are allowed");
    }

    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
        throw new Error("That URL is not allowed");
    }

    // If the host is already a literal IP, check it directly; otherwise resolve.
    if (net.isIP(hostname)) {
        if (isPrivateAddress(hostname)) throw new Error("That URL is not allowed");
        return parsed;
    }

    let addresses;
    try {
        addresses = await dns.lookup(hostname, { all: true });
    } catch {
        throw new Error("Could not resolve that URL");
    }
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
        throw new Error("That URL is not allowed");
    }

    return parsed;
}

module.exports = { assertSafeUrl, isPrivateAddress };
