// Run with `npm test` (node --test).

const test = require("node:test");
const assert = require("node:assert/strict");

const { iosMajor } = require("../lib/install");

test("iosMajor reads the major from what the client sends", () => {
    assert.equal(iosMajor("27.0"), 27);
    assert.equal(iosMajor("26"), 26);
    assert.equal(iosMajor(" 18.6.1 "), 18);
    assert.equal(iosMajor("abc"), null);
    assert.equal(iosMajor(""), null);
    assert.equal(iosMajor(undefined), null);
});
