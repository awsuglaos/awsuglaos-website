#!/usr/bin/env bash
#
# Creates the backoffice admins for a stage: a row in `users` and a matching
# Cognito user for each.
#
#   ./scripts/bootstrap-admins.sh staging
#   ./scripts/bootstrap-admins.sh production
#
# Run it from AWS CloudShell, or anywhere with credentials for the account.
#
# Both halves are required and neither is enough alone: Cognito proves who
# someone is, the `users` row decides what they may do, and a pool user with no
# row is refused at the API. Safe to re-run — the insert upserts on email and
# existing Cognito users are skipped.
#
# Identifiers are discovered rather than hardcoded, because a freshly deployed
# stage has ARNs nobody has seen yet.
set -uo pipefail

STAGE="${1:-}"
REGION="${AWS_REGION:-ap-southeast-1}"
DB_NAME=awsug_lao

if [ -z "$STAGE" ]; then
	echo "usage: $0 <stage>        e.g. $0 production" >&2
	exit 64
fi

# email|display name — edit to add or remove an organiser.
ADMINS=(
	"ketsadaphoneofficial@gmail.com|Ketsadaphone BOUTPANYDA"
	"devlasasimma@gmail.com|Dimitry LASASSIMA"
	"lengleevaja@gmail.com|Lenglee VAJA"
)

die() { echo "error: $*" >&2; exit 1; }

# ----------------------------------------------------------------- discover --
CLUSTER_ID=$(aws rds describe-db-clusters --region "$REGION" \
	--query "DBClusters[?starts_with(DBClusterIdentifier, 'awsug-lao-${STAGE}-databasecluster')].DBClusterIdentifier | [0]" \
	--output text 2>/dev/null)
[ -n "$CLUSTER_ID" ] && [ "$CLUSTER_ID" != "None" ] \
	|| die "no Aurora cluster found for stage '$STAGE' in $REGION. Has it been deployed?"

CLUSTER_ARN=$(aws rds describe-db-clusters --region "$REGION" \
	--db-cluster-identifier "$CLUSTER_ID" \
	--query 'DBClusters[0].DBClusterArn' --output text)

# The Data API needs the Secrets Manager ARN, which is a different object from
# the cluster and is not shown anywhere on the RDS cluster page.
SECRET_ARN=$(aws rds describe-db-clusters --region "$REGION" \
	--db-cluster-identifier "$CLUSTER_ID" \
	--query 'DBClusters[0].MasterUserSecret.SecretArn' --output text 2>/dev/null)
if [ -z "$SECRET_ARN" ] || [ "$SECRET_ARN" = "None" ]; then
	SECRET_ARN=$(aws secretsmanager list-secrets --region "$REGION" \
		--query "SecretList[?contains(Name, 'awsug-lao-${STAGE}')].ARN | [0]" \
		--output text 2>/dev/null)
fi
[ -n "$SECRET_ARN" ] && [ "$SECRET_ARN" != "None" ] \
	|| die "found the cluster but not its Secrets Manager secret."

USER_POOL_ID=$(aws cognito-idp list-user-pools --region "$REGION" --max-results 60 \
	--query "UserPools[?starts_with(Name, 'awsug-lao-${STAGE}')].Id | [0]" \
	--output text 2>/dev/null)
[ -n "$USER_POOL_ID" ] && [ "$USER_POOL_ID" != "None" ] \
	|| die "no Cognito user pool found for stage '$STAGE'."

echo "stage    : $STAGE"
echo "cluster  : $CLUSTER_ID"
echo "user pool: $USER_POOL_ID"
echo

# ---------------------------------------------------------------------- sql --
# Aurora scales to zero, so the first call after an idle period fails
# immediately with DatabaseResumingException rather than waiting for the wake.
run_sql() {
	local sql="$1" attempt out
	for attempt in $(seq 1 12); do
		if out=$(aws rds-data execute-statement --region "$REGION" \
				--resource-arn "$CLUSTER_ARN" --secret-arn "$SECRET_ARN" \
				--database "$DB_NAME" --sql "$sql" 2>&1); then
			printf '%s\n' "$out"
			return 0
		fi
		if printf '%s' "$out" | grep -q "DatabaseResuming"; then
			echo "  Aurora is resuming, retrying in 10s (${attempt}/12)…" >&2
			sleep 10
			continue
		fi
		printf '%s\n' "$out" >&2
		return 1
	done
	echo "gave up waiting for Aurora to resume" >&2
	return 1
}

# Build the VALUES list from ADMINS so the two halves cannot drift apart.
values=""
for entry in "${ADMINS[@]}"; do
	email="${entry%%|*}"
	name="${entry##*|}"
	[ -n "$values" ] && values="${values},"
	values="${values}('${email}', '${name//\'/\'\'}', 'admin')"
done

echo "== admin rows =="
run_sql "
INSERT INTO users (email, name, role) VALUES ${values}
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role
" >/dev/null || die "could not write the admin rows."
echo "  upserted ${#ADMINS[@]}"
echo

# ------------------------------------------------------------------ cognito --
echo "== Cognito users =="
for entry in "${ADMINS[@]}"; do
	email="${entry%%|*}"
	name="${entry##*|}"
	if aws cognito-idp admin-get-user --region "$REGION" \
			--user-pool-id "$USER_POOL_ID" --username "$email" >/dev/null 2>&1; then
		echo "  $email — already exists, skipped"
		continue
	fi
	# Cognito sends the invitation from its own sender, so this works whether or
	# not SES has left the sandbox.
	if aws cognito-idp admin-create-user --region "$REGION" \
			--user-pool-id "$USER_POOL_ID" --username "$email" \
			--user-attributes Name=email,Value="$email" \
			                  Name=email_verified,Value=true \
			                  Name=name,Value="$name" \
			--desired-delivery-mediums EMAIL >/dev/null 2>&1; then
		echo "  $email — created, invitation emailed"
	else
		echo "  $email — FAILED to create" >&2
	fi
done
echo

# ------------------------------------------------------------------- verify --
echo "== users table =="
run_sql "SELECT email, name, role FROM users ORDER BY email" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit("could not parse the query response")
for record in data.get("records", []):
    print("  " + " | ".join(f.get("stringValue", "") for f in record))
'
