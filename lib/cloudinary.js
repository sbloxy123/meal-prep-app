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

// Upload a remote image URL to Cloudinary (it fetches the URL itself). Used by
// recipe import so we store a res.cloudinary.com asset — the frontend's
// next/image only allows that host, and we never persist a raw third-party URL.
// Returns { image_url, image_public_id } or null if Cloudinary isn't configured
// or the upload fails.
async function uploadFromUrl(imageUrl) {
    if (!configured || !imageUrl) return null;
    try {
        const res = await cloudinary.uploader.upload(imageUrl);
        return { image_url: res.secure_url, image_public_id: res.public_id };
    } catch (error) {
        console.error("[cloudinary] failed to upload from url", imageUrl, error.message);
        return null;
    }
}

async function deleteAsset(publicId) {
    if (!configured || !publicId) return;
    try {
        await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        // Don't block recipe deletion on a Cloudinary hiccup — just log it.
        console.error("[cloudinary] failed to delete asset", publicId, error.message);
    }
}

module.exports = { deleteAsset, uploadFromUrl };
