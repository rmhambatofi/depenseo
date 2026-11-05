#!/usr/bin/env bash
# PKI de test au format Apple (P5-02, ADR-041) : racine → intermédiaire (OID 1.2.840.113635.100.6.2.1)
# → feuille de signature (OID 1.2.840.113635.100.6.11.1) et feuille sans cet OID (`plain`), plus une seconde chaîne « pirate » de même
# forme signée par une autre racine. Clés de test uniquement, validité 100 ans. Régénérer :
#   test/fixtures/apple-pki/generate.sh
set -euo pipefail
cd "$(dirname "$0")"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cat >"$work/ext.cnf" <<'CNF'
[ca]
basicConstraints = critical, CA:true
keyUsage = critical, keyCertSign, cRLSign
[intermediate]
basicConstraints = critical, CA:true, pathlen:0
keyUsage = critical, keyCertSign, cRLSign
1.2.840.113635.100.6.2.1 = ASN1:NULL
[leaf]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
1.2.840.113635.100.6.11.1 = ASN1:NULL
[plain]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
CNF
chain() { # $1 = préfixe (feuille `plain` gardée pour `trusted` seulement)
  openssl ecparam -name secp384r1 -genkey -noout -out "$work/$1-root.key"
  openssl req -new -x509 -key "$work/$1-root.key" -subj "/CN=$1 Test Root CA/O=Depenseo tests" \
    -days 36500 -sha384 -extensions ca -config "$work/ext.cnf" -out "$1-root.pem"
  openssl ecparam -name secp384r1 -genkey -noout -out "$work/$1-intermediate.key"
  openssl req -new -key "$work/$1-intermediate.key" -subj "/CN=$1 Test WWDR/O=Depenseo tests" \
    -out "$work/$1-intermediate.csr"
  openssl x509 -req -in "$work/$1-intermediate.csr" -CA "$1-root.pem" -CAkey "$work/$1-root.key" \
    -set_serial 2 -days 36500 -sha384 -extfile "$work/ext.cnf" -extensions intermediate \
    -out "$1-intermediate.pem"
  openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out "$1-leaf.key"
  openssl req -new -key "$1-leaf.key" -subj "/CN=$1 Test StoreKit Signing/O=Depenseo tests" \
    -out "$work/$1-leaf.csr"
  openssl x509 -req -in "$work/$1-leaf.csr" -CA "$1-intermediate.pem" \
    -CAkey "$work/$1-intermediate.key" -set_serial 3 -days 36500 -sha384 -extfile "$work/ext.cnf" \
    -extensions leaf -out "$1-leaf.pem"
  # Feuille valide mais sans l'OID de signature StoreKit (doit être refusée).
  openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out "$1-plain.key"
  openssl req -new -key "$1-plain.key" -subj "/CN=$1 Test Plain Leaf/O=Depenseo tests" \
    -out "$work/$1-plain.csr"
  openssl x509 -req -in "$work/$1-plain.csr" -CA "$1-intermediate.pem" \
    -CAkey "$work/$1-intermediate.key" -set_serial 4 -days 36500 -sha384 -extfile "$work/ext.cnf" \
    -extensions plain -out "$1-plain.pem"
}
chain trusted
chain rogue
rm -f rogue-plain.pem rogue-plain.key
