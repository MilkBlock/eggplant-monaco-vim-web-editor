import { decode } from '@msgpack/msgpack';
import type { PersistedSnapshot } from './snapshotInspector';

type BinaryArtifactHeader = {
  magic: number[] | Uint8Array | string;
  envelope_version: number;
  payload_kind: string;
  payload_codec: string;
  payload_format: string;
  payload_version: number;
  payload_profile?: string | null;
  compatibility_policy: string;
};

type BinaryArtifactEnvelope = {
  header: BinaryArtifactHeader;
  payload_bytes: Uint8Array;
};

function normalizeMagic(value: number[] | Uint8Array | string): string {
  if (typeof value === 'string') {
    return value;
  }
  return String.fromCharCode(...Array.from(value));
}

function isPersistedSnapshot(value: unknown): value is PersistedSnapshot {
  return !!value && typeof value === 'object' && 'snapshot_version' in value && 'format' in value && 'state' in value;
}

export function decodeBinaryPersistedSnapshot(bytes: Uint8Array): {
  header: BinaryArtifactHeader;
  snapshot: PersistedSnapshot;
} {
  const envelope = decode(bytes) as BinaryArtifactEnvelope;
  if (!envelope || typeof envelope !== 'object' || !('header' in envelope) || !('payload_bytes' in envelope)) {
    throw new Error('Binary snapshot envelope is malformed.');
  }

  const magic = normalizeMagic(envelope.header.magic);
  if (magic !== 'EGBIN001') {
    throw new Error(`Unsupported binary snapshot magic: ${magic}`);
  }
  if (envelope.header.payload_kind !== 'persisted_snapshot') {
    throw new Error(`Binary payload kind ${envelope.header.payload_kind} is not a persisted snapshot.`);
  }
  if (envelope.header.payload_codec !== 'message_pack') {
    throw new Error(`Binary payload codec ${envelope.header.payload_codec} is not supported in the web viewer.`);
  }

  const payloadBytes = envelope.payload_bytes instanceof Uint8Array
    ? envelope.payload_bytes
    : new Uint8Array(envelope.payload_bytes as ArrayLike<number>);
  const snapshot = decode(payloadBytes) as PersistedSnapshot;
  if (!isPersistedSnapshot(snapshot)) {
    throw new Error('Decoded binary payload is not a persisted snapshot.');
  }
  return { header: envelope.header, snapshot };
}
