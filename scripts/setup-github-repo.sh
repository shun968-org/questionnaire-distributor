#!/usr/bin/env bash

set -euo pipefail

repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
ruleset_name="protect-default-branch"

gh api -X PATCH "repos/$repo" --silent \
  -F allow_merge_commit=false \
  -F allow_squash_merge=false \
  -F allow_rebase_merge=true \
  -F delete_branch_on_merge=true

id="$(gh api "repos/$repo/rulesets" -q ".[] | select(.name == \"$ruleset_name\") | .id")"
if [ -n "$id" ]; then
  method=PUT path="repos/$repo/rulesets/$id"
else
  method=POST path="repos/$repo/rulesets"
fi

gh api -X "$method" "$path" --input - --silent <<JSON
{
  "name": "$ruleset_name",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["rebase"]
      }
    }
  ]
}
JSON

echo "done: $repo"
