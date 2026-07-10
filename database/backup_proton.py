import os, hashlib, socket, subprocess, tempfile
from pathlib import Path

RCLONE_REMOTE  = "proton"
LOCAL_DATA_DIR = "/Users/jorgevilchis/Documents/Cosas Gestell/Aduanas1/P1 - PDFs"
LOCAL_DB_PATH  = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data/aduanas.db")
REMOTE_BASE    = f"{RCLONE_REMOTE}:Aduanas"
HOSTNAME       = socket.gethostname()

SKIP_EXTENSIONS = {'.ds_store', '.pyc', '.tmp'}


def _file_type(filename):
    ext = Path(filename).suffix.lower()
    if ext == '.pdf':                      return 'pdf'
    if ext in ('.xlsx', '.xls', '.csv'):  return 'excel'
    if ext == '.txt':                      return 'txt'
    return 'otro'


def _md5(filepath):
    h = hashlib.md5()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def backup_to_proton(verbose=True):
    """Respaldo acumulativo a Proton Drive organizado por tipo de archivo.

    - Organiza en: pdf/, excel/, txt/, otro/
    - Deduplica por MD5: mismo contenido → se sube una sola vez
    - Conflicto de nombre (mismo nombre, distinto contenido) → agrega sufijo _2, _3...
    - Nunca borra de la nube (copy, no sync)
    - Ambos equipos pueden correr el script: sus archivos se acumulan
    """
    seen_hashes = set()   # MD5 ya procesado → saltar
    dest_names  = {}      # (ftype, nombre_lower) → contador de conflictos

    with tempfile.TemporaryDirectory() as tmpdir:
        for ftype in ('pdf', 'excel', 'txt', 'otro'):
            os.makedirs(os.path.join(tmpdir, ftype))

        for root, _, files in os.walk(LOCAL_DATA_DIR):
            for fname in sorted(files):
                if Path(fname).suffix.lower() in SKIP_EXTENSIONS:
                    continue

                src   = os.path.join(root, fname)
                ftype = _file_type(fname)

                try:
                    fhash = _md5(src)
                except (PermissionError, OSError):
                    if verbose:
                        print(f"[skip] no se pudo leer: {src}")
                    continue

                if fhash in seen_hashes:
                    if verbose:
                        print(f"[dup]  {fname}")
                    continue
                seen_hashes.add(fhash)

                # Resolver conflicto de nombre
                stem, ext = os.path.splitext(fname)
                key = (ftype, fname.lower())
                if key in dest_names:
                    dest_names[key] += 1
                    dest_fname = f"{stem}_{dest_names[key]}{ext}"
                else:
                    dest_names[key] = 1
                    dest_fname = fname

                os.symlink(src, os.path.join(tmpdir, ftype, dest_fname))
                if verbose:
                    print(f"[ok]   {ftype}/{dest_fname}")

        # Subir estructura organizada (--copy-links para seguir symlinks)
        cmd = ["rclone", "copy", tmpdir, REMOTE_BASE,
               "--copy-links", "--progress",
               "--transfers", "1",                          # un archivo a la vez
               "--retries", "10",                           # reintentos por archivo
               "--retries-sleep", "5s",                     # pausa entre reintentos
               "--low-level-retries", "10",                 # reintentos a nivel HTTP
               "--bwlimit", "500k",                         # 500 KB/s para no saturar la API
               "--protondrive-replace-existing-draft=true"] # evita error "revision not found" en reintentos
        if verbose:
            print(f"\n[proton] {' '.join(cmd)}")
        r = subprocess.run(cmd, capture_output=not verbose)
        if r.returncode != 0:
            err = r.stderr.decode() if r.stderr else f"código {r.returncode}"
            print(f"[proton] ERROR: {err}")
            return False

        # DB separada por equipo
        cmd_db = ["rclone", "copy", LOCAL_DB_PATH,
                  f"{REMOTE_BASE}/db/{HOSTNAME}", "--progress",
                  "--protondrive-replace-existing-draft=true"]
        if verbose:
            print(f"[proton] {' '.join(cmd_db)}")
        r2 = subprocess.run(cmd_db, capture_output=not verbose)
        if r2.returncode != 0:
            err2 = r2.stderr.decode() if r2.stderr else f"código {r2.returncode}"
            print(f"[proton] ERROR DB: {err2}")
            return False

    print("[proton] Respaldo completado.")
    return True


if __name__ == "__main__":
    backup_to_proton()
