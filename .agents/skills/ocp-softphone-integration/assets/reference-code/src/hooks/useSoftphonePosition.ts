import { useEffect } from 'react';
import { useSoftphoneSettings } from './useSoftphoneSettings';

const SOFTPHONE_Z = '9999';
const SOFTPHONE_POPUP_Z = '99999';

/** Возвращает true если HTMLElement принадлежит виджету softphone */
function isSoftphoneElement(el: HTMLElement): boolean {
  const id = el.id ?? '';
  const cls = typeof el.className === 'string' ? el.className : '';
  return (
    id.includes('soft-phone') ||
    id.includes('softphone') ||
    cls.includes('soft-phone') ||
    cls.includes('softphone') ||
    cls.includes('ocp-phone') ||
    !!el.dataset.softphone
  );
}

export function useSoftphonePosition() {
  const { settings } = useSoftphoneSettings();

  useEffect(() => {
    if (!settings) return;

    // Позиционирование применяется к container, а не к root
    const container = document.getElementById('soft-phone-container');
    if (!container) return;

    const { top_offset, right_offset, fixed_to_header, position_anchor = 'top-right' } = settings;

    const applyStyles = () => {
      if (fixed_to_header) {
        const headerElement = document.querySelector('header') || 
                             document.querySelector('[role="banner"]');
        
        if (headerElement) {
          // Позиционируем контейнер поверх header через fixed, НЕ перемещая в React DOM.
          // appendChild в React-управляемый header вызывает removeChild crash при навигации.
          const rect = headerElement.getBoundingClientRect();
          container.style.position = 'fixed';
          container.style.top = `${rect.top + (rect.height / 2)}px`;
          container.style.right = `${right_offset || 16}px`;
          container.style.left = 'auto';
          container.style.bottom = 'auto';
          container.style.transform = 'translateY(-50%)';
          container.style.zIndex = SOFTPHONE_Z;
        } else {
          applyFixedPositioning(container, position_anchor, top_offset, right_offset);
        }
      } else {
        applyFixedPositioning(container, position_anchor, top_offset, right_offset);
      }

      // Enforce z-index on wrapper
      const wrapper = document.getElementById('soft-phone-wrapper');
      if (wrapper) {
        wrapper.style.zIndex = SOFTPHONE_Z;
      }
    };

    applyStyles();

    // Observer 1: следим за изменениями внутри soft-phone-root (wrapper recreate)
    const softphoneRoot = document.getElementById('soft-phone-root');
    const rootObserver = new MutationObserver(() => {
      const wrapper = document.getElementById('soft-phone-wrapper');
      if (wrapper) {
        wrapper.style.zIndex = SOFTPHONE_Z;
      }
    });
    if (softphoneRoot) {
      rootObserver.observe(softphoneRoot, { childList: true, subtree: true });
    }

    // Observer 2: следим за document.body — перехватываем порталы виджета,
    // которые виджет может добавлять напрямую в <body> (диалер, панель звонка)
    const bodyObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement && isSoftphoneElement(node)) {
            node.style.zIndex = SOFTPHONE_POPUP_Z;
          }
        });
      }
    });
    bodyObserver.observe(document.body, { childList: true });

    return () => {
      rootObserver.disconnect();
      bodyObserver.disconnect();
      // Сбрасываем transform при размонтировании
      if (container) {
        container.style.transform = '';
      }
    };
  }, [settings]);

  return { settings };
}

function applyFixedPositioning(
  element: HTMLElement,
  anchor: string,
  verticalOffset: number,
  horizontalOffset: number
) {
  element.style.position = 'fixed';
  element.style.zIndex = SOFTPHONE_Z;
  
  element.style.top = 'auto';
  element.style.bottom = 'auto';
  element.style.left = 'auto';
  element.style.right = 'auto';

  switch (anchor) {
    case 'top-left':
      element.style.top = `${verticalOffset}px`;
      element.style.left = `${horizontalOffset}px`;
      break;
    case 'top-right':
      element.style.top = `${verticalOffset}px`;
      element.style.right = `${horizontalOffset}px`;
      break;
    case 'bottom-left':
      element.style.bottom = `${verticalOffset}px`;
      element.style.left = `${horizontalOffset}px`;
      break;
    case 'bottom-right':
      element.style.bottom = `${verticalOffset}px`;
      element.style.right = `${horizontalOffset}px`;
      break;
    default:
      element.style.top = `${verticalOffset}px`;
      element.style.right = `${horizontalOffset}px`;
  }
}
