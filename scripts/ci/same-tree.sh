#!/usr/bin/env bash
# Decides whether the E2E run of a push to main can be skipped because the exact same tree already passed all six
# E2E shards on the merged PR's head. It writes `skip=true` or `skip=false` to $GITHUB_OUTPUT (stdout when unset).
# It fails safe: anything unexpected (API error, no PR, several commits, partial results) means skip=false, so the shards run.
#
#   same-tree.sh              needs GITHUB_REPOSITORY, GITHUB_SHA, BEFORE (the push's previous main tip), GH_TOKEN
#   same-tree.sh --self-test  offline checks of the decision against fixtures
set -uo pipefail

SHARDS="1 2 3 4 5 6"

# decide <sha> <pulls> <push tree> <head tree> <check-runs> <commits in the push>
# <pulls> and <check-runs> are streams of JSON objects. Prints the reason; returns 0 only when every condition holds.
decide() {
  local sha=$1 pulls=$2 push_tree=$3 head_tree=$4 runs=$5 commits=$6 n
  n=$(jq -s --arg sha "$sha" '[.[] | select(.merge_commit_sha == $sha and .base.ref == "main" and .merged_at != null)] | length' <<<"$pulls") || { echo "cannot read the pull requests"; return 1; }
  [[ $n == 1 ]] || { echo "$n merged PRs have $sha as merge commit, need exactly 1"; return 1; }
  [[ $commits == 1 ]] || { echo "the push holds '$commits' commits, need exactly 1"; return 1; }
  [[ -n $push_tree && $push_tree == "$head_tree" ]] || { echo "trees differ: push '$push_tree', PR head '$head_tree'"; return 1; }
  local shard ok
  for shard in $SHARDS; do
    ok=$(jq -s --arg name "E2E $shard/6" '[.[] | select(.name == $name)] | length > 0 and all(.conclusion == "success")' <<<"$runs") || { echo "cannot read the check-runs"; return 1; }
    [[ $ok == true ]] || { echo "E2E $shard/6 did not conclude success on the PR head"; return 1; }
  done
  echo "same tree $push_tree already passed all 6 E2E shards on the PR head"
}

gather() {
  local r=$GITHUB_REPOSITORY sha=$GITHUB_SHA pulls head push_tree head_tree runs commits
  pulls=$(gh api "repos/$r/commits/$sha/pulls" --paginate --jq '.[]') || { echo "cannot list the PRs of $sha"; return 1; }
  head=$(jq -rs --arg sha "$sha" '[.[] | select(.merge_commit_sha == $sha) | .head.sha] | first // empty' <<<"$pulls") || return 1
  [[ $head =~ ^[0-9a-f]{40}$ ]] || { echo "no PR head found for $sha"; return 1; }
  push_tree=$(gh api "repos/$r/git/commits/$sha" --jq .tree.sha) || { echo "cannot read the tree of $sha"; return 1; }
  head_tree=$(gh api "repos/$r/git/commits/$head" --jq .tree.sha) || { echo "cannot read the tree of $head"; return 1; }
  runs=$(gh api "repos/$r/commits/$head/check-runs" --paginate --jq '.check_runs[]') || { echo "cannot list the check-runs of $head"; return 1; }
  commits=$(gh api "repos/$r/compare/${BEFORE:?}...$sha" --jq .total_commits) || { echo "cannot compare the push"; return 1; }
  echo "PR head $head" >&2
  decide "$sha" "$pulls" "$push_tree" "$head_tree" "$runs" "$commits"
}

self_test() {
  local sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa fails=0
  local pr='{"merge_commit_sha":"'$sha'","base":{"ref":"main"},"merged_at":"2026-01-01T00:00:00Z","head":{"sha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}}'
  local runs='' i
  for i in $SHARDS; do runs+='{"name":"E2E '$i'/6","conclusion":"success"}'$'\n'; done
  # shellcheck disable=SC2016 # a skipped matrix job is reported under its unexpanded name
  runs+='{"name":"E2E ${{ matrix.shard }}/6","conclusion":"skipped"}'$'\n'
  expect() { # expect <true|false> <label> <decide args...>
    local want=$1 label=$2 got=false
    shift 2
    decide "$@" >/dev/null 2>&1 && got=true
    [[ $got == "$want" ]] || { echo "FAIL $label: want $want, got $got"; fails=1; }
  }
  expect true "all conditions hold" "$sha" "$pr" t1 t1 "$runs" 1
  expect false "trees differ" "$sha" "$pr" t1 t2 "$runs" 1
  expect false "empty tree" "$sha" "$pr" "" "" "$runs" 1
  expect false "no PR" "$sha" "" t1 t1 "$runs" 1
  expect false "PR merged as another commit" bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb "$pr" t1 t1 "$runs" 1
  expect false "PR not merged" "$sha" "${pr/\"2026-01-01T00:00:00Z\"/null}" t1 t1 "$runs" 1
  expect false "two PRs" "$sha" "$pr"$'\n'"$pr" t1 t1 "$runs" 1
  expect false "several commits pushed" "$sha" "$pr" t1 t1 "$runs" 3
  expect false "commit count unknown" "$sha" "$pr" t1 t1 "$runs" ""
  expect false "no check-runs" "$sha" "$pr" t1 t1 "" 1
  expect false "one shard missing" "$sha" "$pr" t1 t1 "${runs/E2E 4\/6/E2E 7/6}" 1
  expect false "one shard failed" "$sha" "$pr" t1 t1 "${runs/\"E2E 5\/6\",\"conclusion\":\"success\"/\"E2E 5/6\",\"conclusion\":\"failure\"}" 1
  expect false "one shard still running" "$sha" "$pr" t1 t1 "${runs/\"E2E 2\/6\",\"conclusion\":\"success\"/\"E2E 2/6\",\"conclusion\":null}" 1
  expect false "garbage check-runs" "$sha" "$pr" t1 t1 "not json" 1
  [[ $fails == 0 ]] && echo "self-test passed"
  return $fails
}

if [[ ${1:-} == --self-test ]]; then self_test; exit; fi

if reason=$(gather); then skip=true; else skip=false; fi
echo "skip=$skip: $reason"
echo "skip=$skip" >>"${GITHUB_OUTPUT:-/dev/stdout}"
{ echo "### Push-main E2E: skip=$skip"; echo "$reason"; } >>"${GITHUB_STEP_SUMMARY:-/dev/null}"
