// Vérification des données signées par l'App Store (ADR-041) : JWS ES256 dont l'en-tête `x5c` porte
// la chaîne [feuille, intermédiaire, racine]. La racine doit être l'une des racines de confiance
// (Apple Root CA - G3 en production), chaque certificat signé par le suivant et en cours de validité,
// l'intermédiaire une autorité portant l'OID Apple WWDR, la feuille l'OID de signature StoreKit ;
// la signature du JWS est enfin vérifiée avec la clé de la feuille. Sert aux notifications serveur
// et aux transactions renvoyées par l'App Store Server API.
import { X509Certificate } from 'node:crypto';
import { compactVerify, decodeProtectedHeader } from 'jose';
import type { Clock } from '../clock.js';

/**
 * Apple Root CA - G3, https://www.apple.com/certificateauthority/AppleRootCA-G3.cer (échéance 2039),
 * empreinte SHA-256 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79.
 */
export const APPLE_ROOT_CA_G3 = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----
`;

/**
 * OID DER encodés : 1.2.840.113635.100.6.11.1 (feuille) et 1.2.840.113635.100.6.2.1 (WWDR). Cherchés
 * dans le DER entier plutôt que dans la seule liste d'extensions (Node n'expose pas celle-ci) :
 * contrôle de forme seulement, la sécurité tient à l'ancrage sur la racine Apple qui précède.
 */
const LEAF_OID = Buffer.from('060a2a864886f76364060b01', 'hex');
const INTERMEDIATE_OID = Buffer.from('060a2a864886f76364060201', 'hex');

export class InvalidSignedDataError extends Error {
  override readonly name = 'InvalidSignedDataError';
}

function certificate(der: unknown): X509Certificate {
  if (typeof der !== 'string') throw new InvalidSignedDataError('x5c');
  try {
    return new X509Certificate(Buffer.from(der, 'base64'));
  } catch {
    throw new InvalidSignedDataError('x5c');
  }
}

export class AppleSignedDataVerifier {
  private readonly roots: readonly X509Certificate[];

  /** `rootsPem` : racines de confiance (tests : racine de test ; production : G3). */
  constructor(
    rootsPem: readonly string[],
    private readonly clock: Clock,
  ) {
    this.roots = rootsPem.map((pem) => new X509Certificate(pem));
  }

  /** Contenu du JWS vérifié ; lève `InvalidSignedDataError` à la moindre anomalie. */
  async verify(jws: unknown): Promise<Record<string, unknown>> {
    if (typeof jws !== 'string') throw new InvalidSignedDataError('jws');
    let header;
    try {
      header = decodeProtectedHeader(jws);
    } catch {
      throw new InvalidSignedDataError('header');
    }
    if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length !== 3) {
      throw new InvalidSignedDataError('header');
    }
    const [leaf, intermediate, root] = header.x5c.map(certificate) as [
      X509Certificate,
      X509Certificate,
      X509Certificate,
    ];
    const anchor = this.roots.find((r) => r.fingerprint256 === root.fingerprint256);
    if (!anchor) throw new InvalidSignedDataError('root');
    const pairs: Array<[X509Certificate, X509Certificate]> = [
      [leaf, intermediate],
      [intermediate, anchor],
    ];
    for (const [child, parent] of pairs) {
      if (!child.checkIssued(parent) || !child.verify(parent.publicKey)) {
        throw new InvalidSignedDataError('chain');
      }
    }
    const now = this.clock.now().getTime();
    for (const cert of [leaf, intermediate, anchor]) {
      // `validFromDate` n'existe qu'à partir de Node 22.10 : lecture de la forme textuelle.
      const [from, to] = [Date.parse(cert.validFrom), Date.parse(cert.validTo)];
      // Date illisible (`NaN` rendrait les deux comparaisons fausses) : refus.
      if (Number.isNaN(from) || Number.isNaN(to) || now < from || now > to) {
        throw new InvalidSignedDataError('validity');
      }
    }
    // Défense en profondeur : `checkIssued` exige déjà `keyCertSign` chez l'émetteur.
    if (leaf.ca || !intermediate.ca) throw new InvalidSignedDataError('ca');
    if (!leaf.raw.includes(LEAF_OID) || !intermediate.raw.includes(INTERMEDIATE_OID)) {
      throw new InvalidSignedDataError('oid');
    }
    let payload: unknown;
    try {
      const verified = await compactVerify(jws, leaf.publicKey, { algorithms: ['ES256'] });
      payload = JSON.parse(new TextDecoder().decode(verified.payload));
    } catch {
      throw new InvalidSignedDataError('signature');
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new InvalidSignedDataError('payload');
    }
    return payload as Record<string, unknown>;
  }
}
