import { useRef, useCallback } from 'react';

export const useTapDetector = () => {
  const tapRef = useRef<NodeJS.Timeout>(undefined);

  const detectTap = useCallback(
    (
      onSingle: () => void,
      onDouble?: () => void,
      options?: { delay?: number; preventSingleOnDouble?: boolean }
    ) => {
      const { delay = 300, preventSingleOnDouble = true } = options || {};

      if (tapRef.current) {
        clearTimeout(tapRef.current);
        tapRef.current = undefined;
        if (onDouble) onDouble();
      } else {
        // 즉시 실행이 필요한 경우 (preventSingleOnDouble = false)
        if (!preventSingleOnDouble) {
          onSingle();
        }
        tapRef.current = setTimeout(() => {
          tapRef.current = undefined;
          // 지연 실행이 필요한 경우 (preventSingleOnDouble = true)
          if (preventSingleOnDouble) {
            onSingle();
          }
        }, delay);
      }
    },
    []
  );

  return detectTap;
};
