import { useRef, useCallback } from 'react';

export const useTapDetector = () => {
  const tapRef = useRef<{
    timeout: NodeJS.Timeout,
    key?: any
  }>(undefined);

  const detectTap = useCallback(
    (
      onSingle: () => void,
      onDouble?: () => void,
      options?: { delay?: number; key?: any, preventSingleOnDouble?: boolean }
    ) => {
      const { delay = 300, preventSingleOnDouble = true, key } = options || {};
      if (tapRef.current && key === tapRef.current.key) {
        clearTimeout(tapRef.current.timeout);
        tapRef.current = undefined;
        if (onDouble) onDouble();
      } else {
        // 즉시 실행이 필요한 경우 (preventSingleOnDouble = false)
        if (!preventSingleOnDouble) {
          onSingle();
        }
        tapRef.current = {
          "timeout": setTimeout(() => {
            tapRef.current = undefined;
            // 지연 실행이 필요한 경우 (preventSingleOnDouble = true)
            if (preventSingleOnDouble) {
              onSingle();
            }
          }, delay),
          key
        }
      }
    },
    []
  );

  return detectTap;
};
