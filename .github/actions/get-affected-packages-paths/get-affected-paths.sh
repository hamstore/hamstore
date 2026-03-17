#!/usr/bin/env bash
set -eo pipefail
IFS=$'\n\t'

set -u

get_path() {
    pnpm nx show project $1 --web false --json | jq -r '.root'
}

export -f get_path

readonly AFFECTED_STRING=$(pnpm nx show projects --affected --type lib)
readonly AFFECTED_ARRAY=($(echo "$AFFECTED_STRING" | tr ' ' '\n'))

RESULT=''

if [[ -z "$AFFECTED_STRING" ]]; then
    echo "[]"
    exit 0
fi

for app in "${AFFECTED_ARRAY[@]}"; do
    if [[ -z "${RESULT}" ]]; then
        RESULT=\"$(get_path "$app")\"
    else
        RESULT="$RESULT,\"$(get_path "$app")\""
    fi
done

RESULT="[$RESULT]"

echo "$RESULT"
