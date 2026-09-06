#!/usr/bin/env bash
set -euo pipefail

upload_tree() {
  local local_root="$1"
  local remote_root="$2"

  local_root="${local_root%/}"
  remote_root="${remote_root%/}"

  while IFS= read -r -d '' file; do
    local rel="${file#"$local_root"/}"
    local remote_path="$rel"

    if [[ -n "$remote_root" && "$remote_root" != "." ]]; then
      remote_path="$remote_root/$rel"
    fi

    curl.exe --fail --silent --show-error \
      --retry 5 \
      --retry-delay 2 \
      --retry-all-errors \
      --ftp-create-dirs \
      --user "$FTP_USERNAME:$FTP_PASSWORD" \
      -T "$file" \
      "ftp://$FTP_SERVER:21/$remote_path"
  done < <(find "$local_root" -type f -print0)
}

upload_tree "public/build" "build"
upload_tree "public/build" "public/build"
upload_tree "public/build" "www/build"
echo "Deploy concluido com sucesso"
