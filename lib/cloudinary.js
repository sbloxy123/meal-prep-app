// Cloudinary asset cleanup (§9.5). Deleting a recipe deletes its photo from
// Cloudinary, from the API (never the browser). Configured from env; if the
// credentials aren't set, deleteAsset is a safe no-op so the app still runs
// locally without Cloudinary.
const { v2: cloudinary } = require("cloudinary");

const configured = Boolean(
    process.env.CLOUDINARY_URL ||
        (process.env.CLOUDINARY_CLOUD_NAME &&
            process.env.CLOUDINARY_API_KEY &&
            process.env.CLOUDINARY_API_SECRET),
);

if (configured && !process.env.CLOUDINARY_URL) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
}
// CLOUDINARY_URL is picked up automatically by the SDK when present.

async function deleteAsset(publicId) {
    if (!configured || !publicId) return;
    try {
        await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        // Don't block recipe deletion on a Cloudinary hiccup — just log it.
        console.error("[cloudinary] failed to delete asset", publicId, error.message);
    }
}

module.exports = { deleteAsset };
