// Mochi Device Detection Utility for Studio Desktop Gating and Responsive Layouts

export interface DeviceDetectionOptions {
  userAgent?: string;
  screenWidth?: number;
  hasFinePointer?: boolean;
  maxTouchPoints?: number;
  forcedDesktop?: boolean;
}

export type DeviceCategory = 'desktop' | 'tablet' | 'mobile';

const MOBILE_UA_REGEX = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;
const TABLET_UA_REGEX = /iPad|Android(?!.*Mobile)|Tablet/i;

export function isDesktopDevice(options?: DeviceDetectionOptions): boolean {
  return getDeviceCategory(options) === 'desktop';
}

export function isMobileDevice(options?: DeviceDetectionOptions): boolean {
  return getDeviceCategory(options) === 'mobile';
}

export function isTabletDevice(options?: DeviceDetectionOptions): boolean {
  return getDeviceCategory(options) === 'tablet';
}

export function getDeviceCategory(options?: DeviceDetectionOptions): DeviceCategory {
  if (options?.forcedDesktop) {
    return 'desktop';
  }

  // Check URL param or localStorage override in browser environment
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('force_desktop') === '1' || params.get('force_desktop') === 'true') {
        return 'desktop';
      }
      if (window.localStorage?.getItem('mochi_force_desktop') === 'true') {
        return 'desktop';
      }
    } catch {
      // Ignore security/sandbox storage access exceptions
    }
  }

  const ua = options?.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const width = options?.screenWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1920);
  const maxTouch = options?.maxTouchPoints ?? (typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0);
  const hasFinePointer = options?.hasFinePointer ?? (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: fine)').matches
      : true
  );

  // iPadOS on Safari identifies as Macintosh but has touch points
  const isIPadOS = /Macintosh/i.test(ua) && maxTouch > 1;

  if (TABLET_UA_REGEX.test(ua) || isIPadOS) {
    if (width >= 1024 && hasFinePointer && maxTouch <= 1) {
      return 'desktop';
    }
    return 'tablet';
  }

  if (MOBILE_UA_REGEX.test(ua)) {
    return 'mobile';
  }

  // Screen resolution requirement for 3D Studio editor
  if (width < 768) {
    return 'mobile';
  }

  if (width < 1024 && maxTouch > 0 && !hasFinePointer) {
    return 'tablet';
  }

  return 'desktop';
}
