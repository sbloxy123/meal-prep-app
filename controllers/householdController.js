const crypto = require("crypto");
const db = require("../db/queries");
const { sendEmail, actionEmail } = require("../lib/email");
const { parsePrefs } = require("../lib/dietary");

// Build invite links against the frontend origin (the browser hits the app,
// which proxies /backend + /api/auth back here).
const FRONTEND_URL = (
    process.env.ALLOWED_ORIGINS?.split(",")[0] || "http://localhost:3000"
).trim().replace(/\/$/, "");

const INVITE_TTL_DAYS = 7;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// GET /household — the household, its members, pending invites, caller's role.
// Free households have a member limit (their own snapshot, app_config
// member_limit_free at signup); premium and trial households have none.
// Pending invites hold a seat, so five invites can't be sent for one seat.
// Members already present when a plan lapses are never removed — only new
// invites are blocked. This is the retention-side paywall: the upgrade
// prompt sits exactly where someone is trying to bring another person in.
function seatCheck(entitlement, members, invites) {
    const limit = entitlement.memberLimit;
    const seats = members.length + invites.length;
    if (limit == null) return { canInvite: true, reason: null, limit: null, seats };
    if (seats >= limit) {
        return {
            canInvite: false,
            limit,
            seats,
            reason:
                limit === 1
                    ? "Sharing your kitchen is part of Premium."
                    : `Your plan includes ${limit} people. Premium lets the whole household in.`,
        };
    }
    return { canInvite: true, reason: null, limit, seats };
}

async function getHousehold(req, res, next) {
    try {
        const [household, members, invites, entitlement] = await Promise.all([
            db.getHouseholdById(req.householdId),
            db.getHouseholdMembers(req.householdId),
            db.getPendingInvites(req.householdId),
            db.getEntitlement(req.householdId),
        ]);
        const me = members.find((m) => m.user_id === req.user.id);
        const seat = seatCheck(entitlement, members, invites);
        res.json({
            household,
            members,
            invites,
            role: me?.role ?? "member",
            plan: entitlement.plan,
            memberLimit: seat.limit,
            canInvite: seat.canInvite,
            reason: seat.reason,
        });
    } catch (error) {
        next(error);
    }
}

async function inviteMember(req, res, next) {
    try {
        if ((await db.getMemberRole(req.householdId, req.user.id)) !== "owner") {
            return res.status(403).json({ error: "Only the household owner can invite people." });
        }
        const email =
            typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
        if (!EMAIL_RE.test(email)) {
            return res.status(400).json({ error: "Enter a valid email address." });
        }
        if (email === (req.user.email ?? "").toLowerCase()) {
            return res.status(400).json({ error: "That's your own email." });
        }
        const [members, invites, entitlement] = await Promise.all([
            db.getHouseholdMembers(req.householdId),
            db.getPendingInvites(req.householdId),
            db.getEntitlement(req.householdId),
        ]);
        if (members.some((m) => (m.email ?? "").toLowerCase() === email)) {
            return res.status(400).json({ error: "They're already in your household." });
        }
        // Re-inviting someone who already holds a pending seat replaces that
        // invite (createInvite deletes it), so it doesn't need a second seat.
        const alreadyPending = invites.some((i) => (i.invited_email ?? "").toLowerCase() === email);
        const seat = seatCheck(entitlement, members, alreadyPending ? invites.slice(1) : invites);
        if (!seat.canInvite) {
            db.recordEvent("household_limit_hit", {
                userId: req.user.id,
                householdId: req.householdId,
                meta: { limit: seat.limit, seats: seat.seats, plan: entitlement.plan },
            });
            return res.status(402).json({
                error: "HOUSEHOLD_LIMIT",
                message: seat.reason,
                limit: seat.limit,
                seats: seat.seats,
                plan: entitlement.plan,
            });
        }

        const token = crypto.randomBytes(24).toString("base64url");
        const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000);
        await db.createInvite(req.householdId, email, req.user.id, token, expiresAt);

        const household = await db.getHouseholdById(req.householdId);
        const householdName = household?.name || "their kitchen";
        const inviter = req.user.name || req.user.email;
        const link = `${FRONTEND_URL}/household/join/${token}`;
        await sendEmail({
            to: email,
            subject: `${inviter} invited you to their Fornetto kitchen`,
            text: `${inviter} invited you to join "${householdName}" on Fornetto. Accept your invite: ${link}`,
            html: actionEmail({
                heading: "You've been invited",
                body: `${inviter} invited you to join “${householdName}” on Fornetto — a shared pool of recipes, weekly menus and shopping lists. This invite expires in ${INVITE_TTL_DAYS} days.`,
                buttonLabel: "Join the household",
                url: link,
            }),
        });
        res.status(201).json({ success: true });
    } catch (error) {
        next(error);
    }
}

async function acceptInvite(req, res, next) {
    try {
        const token = typeof req.body.token === "string" ? req.body.token : "";
        if (!token) return res.status(400).json({ error: "Missing invite token." });
        const result = await db.acceptInvite(req.user.id, token);
        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
}

async function leaveHousehold(req, res, next) {
    try {
        await db.leaveHousehold(req.user.id, req.user.name);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
}

async function removeMember(req, res, next) {
    try {
        if ((await db.getMemberRole(req.householdId, req.user.id)) !== "owner") {
            return res.status(403).json({ error: "Only the household owner can remove members." });
        }
        if (req.params.userId === req.user.id) {
            return res.status(400).json({ error: "Use ‘Leave household’ to remove yourself." });
        }
        await db.removeMember(req.householdId, req.params.userId);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
}

async function renameHousehold(req, res, next) {
    try {
        if ((await db.getMemberRole(req.householdId, req.user.id)) !== "owner") {
            return res.status(403).json({ error: "Only the household owner can rename it." });
        }
        const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
        if (!name) return res.status(400).json({ error: "Enter a household name." });
        await db.renameHousehold(req.householdId, name.slice(0, 80));
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
}

// Shared by both preference writes: save the caller's own prefs, then apply
// (or clear) the household-wide rule.
//
// The kitchen-wide rule is owner-only. Anyone can record their own dietary
// needs, but a rule that constrains every suggestion for everyone is the
// owner's call — and it stops a member setting one by mistake. A non-owner
// still gets their answers saved; we report householdRuleApplied: false so the
// UI can say why the wider setting didn't stick, rather than 403ing a request
// that did do most of what was asked.
async function applyPrefs(req, prefs) {
    await db.setMemberFoodPrefs(req.householdId, req.user.id, prefs);

    const isOwner = (await db.getMemberRole(req.householdId, req.user.id)) === "owner";
    const wantsRule = prefs.scope === "everyone" && prefs.diets.length > 0;
    if (!isOwner) return false;

    if (wantsRule) {
        await db.setHouseholdDietaryRule(req.householdId, {
            v: 1,
            diets: prefs.diets,
            setBy: req.user.id,
        });
        return true;
    }
    // Owner moved their scope off "everyone": clear the rule so a stale
    // kitchen-wide restriction can't outlive the answer that created it.
    await db.setHouseholdDietaryRule(req.householdId, null);
    return false;
}

// PUT /household/dietary — preference edits from Account, and the wizard's
// step-3 save. No onboarding side effects.
async function saveDietary(req, res, next) {
    try {
        const prefs = parsePrefs(req.body);
        if (!prefs) return res.status(400).json({ error: "Nothing to save." });
        const householdRuleApplied = await applyPrefs(req, prefs);
        res.json({ success: true, householdRuleApplied });
    } catch (error) {
        next(error);
    }
}

// PUT /household/onboarding — the questionnaire finishing (completed) or being
// explicitly skipped. Idempotent: plain UPDATEs, safe to retry.
async function saveOnboarding(req, res, next) {
    try {
        const outcome = req.body?.outcome;
        if (outcome !== "completed" && outcome !== "skipped") {
            return res.status(400).json({ error: "Bad outcome." });
        }
        const prefs = parsePrefs(req.body); // null is fine — a step-1 skip has no answers
        await db.setMemberOnboarding(req.householdId, req.user.id, { prefs, outcome });
        let householdRuleApplied = false;
        if (prefs) householdRuleApplied = await applyPrefs(req, prefs);
        res.json({ success: true, householdRuleApplied });
    } catch (error) {
        next(error);
    }
}

async function revokeInvite(req, res, next) {
    try {
        if ((await db.getMemberRole(req.householdId, req.user.id)) !== "owner") {
            return res.status(403).json({ error: "Only the household owner can revoke invites." });
        }
        await db.revokeInvite(req.householdId, req.params.inviteId);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    seatCheck,
    getHousehold,
    inviteMember,
    acceptInvite,
    leaveHousehold,
    removeMember,
    renameHousehold,
    revokeInvite,
    saveDietary,
    saveOnboarding,
};
