/**
 * Unsigned upload to Cloudinary (raw) for PDFs.
 * Requires VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in .env
 */
export async function uploadPdfToCloudinary(file) {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME?.trim();
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET?.trim();

  if (!cloudName || !preset) {
    throw new Error(
      "Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to your .env file.",
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", preset);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
    { method: "POST", body: formData },
  );

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      data?.error?.message ||
      (typeof data?.error === "string" ? data.error : null) ||
      `Upload failed (${res.status})`;
    throw new Error(msg);
  }

  if (!data.secure_url) {
    throw new Error("Upload failed: no secure URL returned from Cloudinary.");
  }

  return {
    secureUrl: data.secure_url,
    publicId: data.public_id != null ? String(data.public_id) : null,
  };
}
