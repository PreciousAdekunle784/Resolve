"""Crops the app screenshots for the document: removes the navigation sidebar from in-app
screens so the content is larger on an A4 page. Writes evidence-assets/figures/*.png."""
import glob
import os

from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, "..", "evidence-assets", "screens")
out = os.path.join(here, "..", "evidence-assets", "figures")
os.makedirs(out, exist_ok=True)
NO_SIDEBAR = {"01-landing", "02-official-guidance", "03-sign-in", "04-register", "05-onboarding-consent", "25-mobile-case", "26-mobile-dashboard"}
for path in sorted(glob.glob(os.path.join(src, "*.png"))):
    name = os.path.splitext(os.path.basename(path))[0]
    im = Image.open(path).convert("RGB")
    if name not in NO_SIDEBAR:
        im = im.crop((540, 0, im.width - 40, im.height))  # sidebar is 255 CSS px (x2)
    im.save(os.path.join(out, f"{name}.png"), optimize=True)
    print(name, im.size)
