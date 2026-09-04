// One Stripe client for the app (lib/auth.js's plugin, lib/offers.js). Null
// when the keys aren't set so local/dev boots without payments.
const Stripe = require("stripe");

const stripeClient = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

module.exports = { stripeClient };
