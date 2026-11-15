// SPDX-License-Identifier: AGPL-3.0-or-later

const WALLPAPER_STORAGE_KEY = "yase-wallpaper";
const MAX_WALLPAPER_SIZE = 2 * 1024 * 1024;
const WALLPAPER_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const WALLPAPER_DATA_URL = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]*={0,2}$/;

const readWallpaper = (): string | null => {
  try {
    const wallpaper = localStorage.getItem(WALLPAPER_STORAGE_KEY);
    return wallpaper && WALLPAPER_DATA_URL.test(wallpaper) ? wallpaper : null;
  } catch {
    return null;
  }
};

const applyWallpaper = (wallpaper: string | null): void => {
  const root = document.documentElement;
  if (wallpaper) {
    root.style.backgroundImage = `url("${wallpaper}")`;
    root.classList.add("has-wallpaper");
    return;
  }

  root.style.removeProperty("background-image");
  root.classList.remove("has-wallpaper");
};

const initializeWallpaper = (): void => {
  const wallpaper = readWallpaper();
  applyWallpaper(wallpaper);

  const upload = document.querySelector<HTMLInputElement>("#wallpaper-upload");
  const remove = document.querySelector<HTMLButtonElement>("#wallpaper-remove");
  const status = document.querySelector<HTMLElement>("#wallpaper-status");
  if (!(upload && remove && status)) return;

  remove.disabled = !wallpaper;
  if (wallpaper) status.textContent = "Wallpaper is active.";

  upload.addEventListener("change", () => {
    const file = upload.files?.[0];
    if (!file) return;

    if (!WALLPAPER_TYPES.includes(file.type)) {
      status.textContent = "Choose a PNG, JPEG, WebP, or GIF image.";
      upload.value = "";
      return;
    }

    if (file.size > MAX_WALLPAPER_SIZE) {
      status.textContent = "Image is larger than 2 MB.";
      upload.value = "";
      return;
    }

    status.textContent = "Loading wallpaper…";
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string" || !WALLPAPER_DATA_URL.test(reader.result)) {
        status.textContent = "Could not read this image.";
        return;
      }

      try {
        localStorage.setItem(WALLPAPER_STORAGE_KEY, reader.result);
        applyWallpaper(reader.result);
        remove.disabled = false;
        status.textContent = "Wallpaper saved in this browser.";
      } catch {
        status.textContent = "Could not save the wallpaper in browser storage.";
      }
    });
    reader.addEventListener("error", () => {
      status.textContent = "Could not read this image.";
    });
    reader.readAsDataURL(file);
    upload.value = "";
  });

  remove.addEventListener("click", () => {
    try {
      localStorage.removeItem(WALLPAPER_STORAGE_KEY);
      applyWallpaper(null);
      remove.disabled = true;
      status.textContent = "Wallpaper removed.";
    } catch {
      status.textContent = "Could not remove the wallpaper from browser storage.";
    }
  });
};

initializeWallpaper();

export {};
