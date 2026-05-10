import type {
  CompactedReferenceField,
  CompactionPolicy,
  PayloadDiagnostics,
} from "./types";

const encoder = new TextEncoder();

const HEAVY_FIELD_TOKENS = [
  "html",
  "markup",
  "sourcehtmlsnippet",
  "rawhtml",
  "fullhtml",
  "database64",
  "base64",
  "screenshot",
  "image",
  "dom",
  "rawpayload",
  "binary",
];

export const DEFAULT_COMPACTION_POLICY: CompactionPolicy = {
  maxInputPayloadBytes: 220_000,
  maxRenderedPromptBytes: 260_000,
  maxAttachmentBytesTotal: 4_000_000,
  maxSingleAttachmentBytes: 1_500_000,
  maxStringBytes: 12_000,
  maxArrayItems: 160,
  maxObjectDepth: 8,
  previewChars: 220,
};

export type CompactableAttachment = {
  name: string;
  mimeType: string;
  data: string;
};

export type CompactionResult = {
  inputPayload: Record<string, unknown>;
  attachments: CompactableAttachment[];
  diagnostics: PayloadDiagnostics;
};

function byteLengthOfText(value: string) {
  return encoder.encode(value).length;
}

function byteLengthOfJson(value: unknown) {
  return byteLengthOfText(JSON.stringify(value ?? null));
}

function looksLikeBase64(value: string) {
  const compact = value.replace(/\s+/g, "");
  return compact.length > 512 && /^[A-Za-z0-9+/=]+$/.test(compact);
}

function isHeavyPath(path: string) {
  const normalized = path.toLowerCase();
  return HEAVY_FIELD_TOKENS.some((token) => normalized.includes(token));
}

function truncatePreview(value: string, limit: number) {
  const preview = value.slice(0, limit);
  return value.length > limit ? `${preview}...` : preview;
}

function pushCompaction(
  compactedFields: CompactedReferenceField[],
  field: CompactedReferenceField,
) {
  compactedFields.push(field);
}

function compactValue(
  value: unknown,
  path: string,
  policy: CompactionPolicy,
  compactedFields: CompactedReferenceField[],
  depth: number,
): unknown {
  if (depth > policy.maxObjectDepth) {
    const originalBytes = byteLengthOfJson(value);
    const compacted = {
      __compactedReference: true,
      strategy: "reference_only",
      reason: "max_depth_exceeded",
      originalType: Array.isArray(value) ? "array" : typeof value,
      originalBytes,
    };
    pushCompaction(compactedFields, {
      path,
      reason: "max_depth_exceeded",
      originalBytes,
      retainedBytes: byteLengthOfJson(compacted),
      originalType: Array.isArray(value) ? "array" : typeof value,
    });
    return compacted;
  }

  if (typeof value === "string") {
    const originalBytes = byteLengthOfText(value);
    const heavyPath = isHeavyPath(path);
    if (
      (heavyPath && originalBytes > 1_024) ||
      looksLikeBase64(value) ||
      originalBytes > policy.maxStringBytes
    ) {
      const compacted = {
        __compactedReference: true,
        strategy: "reference_only",
        reason: heavyPath ? "heavy_field_string" : "oversized_string",
        originalType: "string",
        originalBytes,
        preview: truncatePreview(value, policy.previewChars),
      };
      pushCompaction(compactedFields, {
        path,
        reason: heavyPath ? "heavy_field_string" : "oversized_string",
        originalBytes,
        retainedBytes: byteLengthOfJson(compacted),
        originalType: "string",
        preview: compacted.preview,
      });
      return compacted;
    }
    return value;
  }

  if (Array.isArray(value)) {
    const limited = value.slice(0, policy.maxArrayItems);
    const compactedArray = limited.map((item, index) =>
      compactValue(item, `${path}[${index}]`, policy, compactedFields, depth + 1),
    );
    if (value.length > policy.maxArrayItems) {
      pushCompaction(compactedFields, {
        path,
        reason: "array_truncated",
        originalBytes: byteLengthOfJson(value),
        retainedBytes: byteLengthOfJson(compactedArray),
        originalType: "array",
      });
    }
    return compactedArray;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const compactedObject: Record<string, unknown> = {};
    for (const [key, entryValue] of entries) {
      const entryPath = path ? `${path}.${key}` : key;
      compactedObject[key] = compactValue(entryValue, entryPath, policy, compactedFields, depth + 1);
    }
    return compactedObject;
  }

  return value;
}

function compactAttachments(
  attachments: CompactableAttachment[],
  policy: CompactionPolicy,
  compactedFields: CompactedReferenceField[],
) {
  const compacted = attachments.map((attachment, index) => {
    const originalBytes = byteLengthOfText(attachment.data || "");
    if (!attachment.data || originalBytes <= policy.maxSingleAttachmentBytes) {
      return attachment;
    }
    pushCompaction(compactedFields, {
      path: `attachments[${index}].data`,
      reason: "attachment_exceeds_single_limit",
      originalBytes,
      retainedBytes: 0,
      originalType: "string",
    });
    return { ...attachment, data: "" };
  });

  let total = compacted.reduce((sum, item) => sum + byteLengthOfText(item.data || ""), 0);
  if (total <= policy.maxAttachmentBytesTotal) return compacted;

  for (let index = compacted.length - 1; index >= 0 && total > policy.maxAttachmentBytesTotal; index -= 1) {
    const item = compacted[index];
    const bytes = byteLengthOfText(item.data || "");
    if (!bytes) continue;
    compacted[index] = { ...item, data: "" };
    total -= bytes;
    pushCompaction(compactedFields, {
      path: `attachments[${index}].data`,
      reason: "attachment_exceeds_total_limit",
      originalBytes: bytes,
      retainedBytes: 0,
      originalType: "string",
    });
  }

  return compacted;
}

export function renderTemplateWithPayload(template: string, inputPayload: Record<string, unknown>) {
  const inputJson = JSON.stringify(inputPayload, null, 2);
  return String(template || "")
    .replaceAll("{{input_payload_json}}", inputJson)
    .replaceAll("{{inputPayloadJson}}", inputJson);
}

export function compactPromptRequest(input: {
  inputPayload: Record<string, unknown>;
  attachments: CompactableAttachment[];
  userPromptTemplate: string;
  policy?: CompactionPolicy;
}): CompactionResult {
  const policy = input.policy || DEFAULT_COMPACTION_POLICY;
  const compactedFields: CompactedReferenceField[] = [];
  const inputPayloadBefore = input.inputPayload || {};
  const attachmentsBefore = input.attachments || [];

  const sizeBeforeBytes = byteLengthOfJson(inputPayloadBefore);
  const attachmentsBytesBefore = attachmentsBefore.reduce(
    (sum, item) => sum + byteLengthOfText(item.data || ""),
    0,
  );
  const promptBefore = renderTemplateWithPayload(input.userPromptTemplate, inputPayloadBefore);
  const promptBytesBefore = byteLengthOfText(promptBefore);

  const compactedInputPayload =
    (compactValue(inputPayloadBefore, "", policy, compactedFields, 0) as Record<string, unknown>) || {};
  const compactedAttachments = compactAttachments(attachmentsBefore, policy, compactedFields);

  const sizeAfterBytes = byteLengthOfJson(compactedInputPayload);
  const attachmentsBytesAfter = compactedAttachments.reduce(
    (sum, item) => sum + byteLengthOfText(item.data || ""),
    0,
  );
  const promptAfter = renderTemplateWithPayload(input.userPromptTemplate, compactedInputPayload);
  const promptBytesAfter = byteLengthOfText(promptAfter);

  const rejectedReasons: string[] = [];
  if (sizeAfterBytes > policy.maxInputPayloadBytes) {
    rejectedReasons.push(
      `input payload ${sizeAfterBytes}B exceeds max ${policy.maxInputPayloadBytes}B`,
    );
  }
  if (promptBytesAfter > policy.maxRenderedPromptBytes) {
    rejectedReasons.push(
      `rendered prompt ${promptBytesAfter}B exceeds max ${policy.maxRenderedPromptBytes}B`,
    );
  }
  if (attachmentsBytesAfter > policy.maxAttachmentBytesTotal) {
    rejectedReasons.push(
      `attachments ${attachmentsBytesAfter}B exceeds max ${policy.maxAttachmentBytesTotal}B`,
    );
  }

  const payloadStatus: PayloadDiagnostics["payloadStatus"] =
    rejectedReasons.length > 0
      ? "rejected"
      : compactedFields.length > 0
        ? "compacted"
        : "ok";

  return {
    inputPayload: compactedInputPayload,
    attachments: compactedAttachments,
    diagnostics: {
      payloadStatus,
      sizeBeforeBytes,
      sizeAfterBytes,
      promptBytesBefore,
      promptBytesAfter,
      attachmentsBytesBefore,
      attachmentsBytesAfter,
      compactedFields,
      rejectionReason: rejectedReasons.length ? rejectedReasons.join("; ") : undefined,
    },
  };
}
