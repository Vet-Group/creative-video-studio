# Usage: awk -f keep-vet-values.awk OLD_ENV NEW_ENV > MERGED
# A `NAME=` line (empty value) in NEW_ENV keeps the non-empty `NAME=value` line from OLD_ENV. Prints only names, to stderr.
NR == FNR { if ($0 ~ /^[A-Z_][A-Z0-9_]*=./) old[substr($0, 1, index($0, "=") - 1)] = $0; next }
/^[A-Z_][A-Z0-9_]*=$/ {
  k = substr($0, 1, length($0) - 1)
  if (k in old) { print old[k]; kept = kept " " k; next }
}
{ print }
END { if (kept != "") print "kept from VET:" kept > "/dev/stderr" }
