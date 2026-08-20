const crypto = require("crypto");
const db = require("../db/queries");
const { sendEmail, actionEmail } = require("../lib/email");

// Build invite links against the frontend origin (the browser hits the app,
// which proxies /backend + /api/auth back here).
const FRONTEND_URL = (
    process.env.ALLOWED_ORIGINS?.split(",")[0] || "http://localhost:3000"
).trim().replace(/\/$/, "");

const INVITE_TTL_DAYS = 7;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// GET /household — the household, its members, pending invites, caller's role.
async function getHousehold(req, res, next) {
    try {
        const [household, members, invites] = await Promise.all([
            db.getHouseholdById(req.householdId),
            db.getHouseholdMembers(req.householdId),
            db.getPendingInvites(req.householdId),
        ]);
        const me = members.find((m) => m.user_id === req.user.id);
        res.json({ household, members, invites, role: me?.role ?? "member" });
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
        const members = await db.getHouseholdMembers(req.householdId);
        if (members.some((m) => (m.email ?? "").toLowerCase() === email)) {
            return res.status(400).json({ error: "They're already in your household." });
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
            subject: `${inviter} invited you to their Mise en Place kitchen`,
            text: `${inviter} invited you to join "${householdName}" on Mise en Place. Accept your invite: ${link}`,
            html: actionEmail({
                heading: "You've been invited",
                body: `${inviter} invited you to join “${householdName}” on Mise en Place — a shared pool of recipes, weekly menus and shopping lists. This invite expires in ${INVITE_TTL_DAYS} days.`,
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
    getHousehold,
    inviteMember,
    acceptInvite,
    leaveHousehold,
    removeMember,
    renameHousehold,
    revokeInvite,
};
