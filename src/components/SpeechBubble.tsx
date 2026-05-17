// SpeechBubble.tsx
// -----------------------------------------------------------------------------
// Petin başının üstünde beliren küçük konuşma balonu. Mesaj null/boş ise
// hiç render etmez ki şeffaf pencerede gereksiz kutucuk gözükmesin.
// -----------------------------------------------------------------------------

interface Props {
  message: string | null;
  /** "dragged" gibi state'lerde mouse olaylarını engellemesin. */
  visible: boolean;
}

export function SpeechBubble({ message, visible }: Props) {
  if (!visible || !message) return null;

  return (
    <div className="speech-bubble" data-no-drag>
      <span className="speech-bubble__text">{message}</span>
      <div className="speech-bubble__tail" />
    </div>
  );
}
