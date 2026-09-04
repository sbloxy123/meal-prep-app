// Run with `npm test` (node --test).
//
// The install email is the one transactional email whose link is built by us
// rather than by BetterAuth, so pin down the bits the guide page depends on.

const test = require("node:test");
const assert = require("node:assert/strict");

const { installEmail, installEmailText, actionEmail } = require("../lib/email");

const url = "https://fornetto.app/install?from=email";

test("install email links to the guide, in HTML and text", () => {
    const html = installEmail({ url });
    assert.ok(html.includes(`href="${url}"`));
    assert.ok(html.includes("Add to Home Screen"));
    assert.ok(html.includes("Open this email <strong>on your phone</strong>"));

    const text = installEmailText(url);
    assert.ok(text.includes(url));
    assert.ok(text.includes("Add to Home Screen"));
    assert.ok(text.includes("Android"));
});

test("action email keeps its one-button shape", () => {
    const html = actionEmail({ heading: "H", body: "B", buttonLabel: "Go", url });
    assert.ok(html.includes("<h1"));
    assert.equal(html.split(`href="${url}"`).length - 1, 1);
    assert.ok(html.includes("paste this link into your browser"));
});

test("trial emails: one button to /premium, the keep-everything promise, both stages", () => {
    const { trialEmail, trialEmailText } = require("../lib/email");
    const base = { daysLeft: 4, endsOn: "Sunday 20 September", url: "https://fornetto.app/premium?from=trial_email_ending_soon", freeCredits: 50, premiumCredits: 300, name: "Sam <b>" };
    const html = trialEmail({ ...base, stage: "ending_soon" });
    assert.ok(html.includes("4 days left on your Premium trial"));
    assert.ok(html.includes("Hi Sam &lt;b&gt;,"));
    assert.ok(html.includes("stays exactly where it is"));
    assert.equal(html.split(`href="${base.url}"`).length - 1, 1);
    const last = trialEmail({ ...base, stage: "last_day", daysLeft: 1 });
    assert.ok(last.includes("Your Premium trial ends tomorrow"));
    const text = trialEmailText({ ...base, stage: "last_day", daysLeft: 1 });
    assert.ok(text.includes("ends tomorrow"));
    assert.ok(text.includes(base.url));
    assert.ok(text.includes("50 AI credits"));
});
