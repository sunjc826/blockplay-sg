"""Explicit allowlist: never include credentials, request receipts, or local state."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parent.parent
public = root / 'public'
with ZipFile(public / 'last-train-review.zip', 'w', ZIP_DEFLATED) as archive:
    archive.write(root / 'README.md', 'README.md')
    for name in ['codex.txt', 'pi-dev.txt']:
        archive.write(root / 'prompts' / name, 'prompts/' + name)
    for name in ['index.html', 'app.js', 'story.js', 'style.css', 'review.html', 'poster.svg', '_headers']:
        archive.write(public / name, 'site/' + name)
    for path in sorted((public / 'audio').iterdir()):
        if path.suffix in ['.mp3', '.json']:
            archive.write(path, 'site/audio/' + path.name)
print('Packaged public source, pitch, story, poster and audio; no secrets or receipts.')
