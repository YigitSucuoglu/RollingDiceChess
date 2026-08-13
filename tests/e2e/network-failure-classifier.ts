export interface RequestFailureEvidence {
  readonly browserName: string;
  readonly errorText?: string;
  readonly resourceType: string;
  readonly supersededByNavigation: boolean;
}

export function isBenignBrowserCancellation(
  evidence: RequestFailureEvidence,
): boolean {
  return evidence.browserName === "firefox"
    && evidence.resourceType === "image"
    && evidence.supersededByNavigation
    && evidence.errorText === "NS_BINDING_ABORTED";
}

export function isHttpFailure(status: number): boolean {
  return status >= 400;
}
