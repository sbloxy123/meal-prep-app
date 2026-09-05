// Run with `npm test` (node --test).
//
// lib/clientHint.js reads the X-Fornetto-Client header that tells us whether
// a request came from the installed (home-screen) app. It is client-supplied,
// so the parser must be strict: anything it doesn't recognise is "no hint".

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseClientHint, clientHintFrom, HINT_HEADER } = require("../lib/clientHint");

test("standalone and browser, with and without a platform", () => {
    assert.deepEqual(parseClientHint("standalone/ios"), { standalone: true, platform: "ios" });
    assert.deepEqual(parseClientHint("browser/desktop"), { standalone: false, platform: "desktop" });
    assert.deepEqual(parseClientHint("standalone"), { standalone: true, platform: null });
    assert.deepEqual(parseClientHint(" Browser/Android "), { standalone: false, platform: "android" });
});

test("junk is no hint, never a crash", () => {
    assert.equal(parseClientHint(""), null);
    assert.equal(parseClientHint(undefined), null);
    assert.equal(parseClientHint(42), null);
    assert.equal(parseClientHint("installed/ios"), null);
    assert.equal(parseClientHint("standalone/ios/extra"), null);
    assert.equal(parseClientHint("standalone/i0s"), null);
    assert.equal(parseClientHint("standalone/" + "a".repeat(17)), null);
});

test("clientHintFrom reads the lower-cased header off a request", () => {
    assert.deepEqual(clientHintFrom({ headers: { [HINT_HEADER]: "standalone/android" } }), { standalone: true, platform: "android" });
    assert.equal(clientHintFrom({ headers: {} }), null);
    assert.equal(clientHintFrom(null), null);
});
