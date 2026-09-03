#!/bin/sh
set -eu

acl_file=/run/secrets/redis_acl

[ -r "$acl_file" ] || exit 1

password="$(awk '
    $1 == "user" && $2 == "default" {
        for (i = 3; i <= NF; i++) {
            if (substr($i, 1, 1) == ">" && length($i) > 1) {
                print substr($i, 2)
                found = 1
                exit
            }
        }
    }
    END { if (!found) exit 1 }
' "$acl_file")" || exit 1

[ -n "$password" ] || exit 1

response="$(REDISCLI_AUTH="$password" redis-cli --no-auth-warning --raw ping 2>/dev/null)" || exit 1
[ "$response" = 'PONG' ]

unset password response
