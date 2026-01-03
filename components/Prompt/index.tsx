'use client'

import { useEffect, useState } from 'react';

import './styles.scss';

export default function Prompt({
    show,
    title,
    explanation,
    agreeButtonTitle = 'OK',
    dismissButtonTitle = 'Cancel',
    className = '',
    buttonsBlockClassName = '',
    agreeButtonClassName = '',
    dismissButtonClassName = '',
    onAgree,
    onDismiss,
}: {
    show: boolean,
    title: string,
    explanation?: string,
    agreeButtonTitle?: string,
    dismissButtonTitle?: string,
    className?: string,
    buttonsBlockClassName?: string,
    agreeButtonClassName?: string,
    dismissButtonClassName?: string,
    onAgree: () => void,
    onDismiss: () => void,
}) {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    setShowPrompt(show);
  }, [show]);
    
  if (!showPrompt) return null;

  return (
    <div className={`prompt-window-block ${className}`}>
      <div><b>{title}</b></div>
      {explanation && <p>{explanation}</p>}
      <div className={`buttons-block ${buttonsBlockClassName}`}>
        <button
          className={`btn btn-sm ${agreeButtonClassName}`}
          onClick={onAgree}
        >
          {agreeButtonTitle}
        </button>
        <button
          className={`btn btn-default btn-sm ${dismissButtonClassName}`}
          onClick={onDismiss}
        >
          {dismissButtonTitle}
        </button>
      </div>
    </div>
  )
}
