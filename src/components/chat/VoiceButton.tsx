'use client';

import { Mic, MicOff, Loader2 } from 'lucide-react';
import { useVocalBridge } from '@vocalbridgeai/react';
import { ConnectionState } from '@vocalbridgeai/sdk';

export default function VoiceButton(): React.JSX.Element {
  const { state, connect, disconnect, isMicrophoneEnabled, toggleMicrophone } = useVocalBridge();

  const isConnecting =
    state === ConnectionState.Connecting || state === ConnectionState.WaitingForAgent;
  const isConnected = state === ConnectionState.Connected;

  function handleClick(): void {
    if (isConnected) {
      disconnect().catch(() => null);
    } else if (!isConnecting) {
      connect().catch(() => null);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onDoubleClick={() => {
        if (isConnected) toggleMicrophone().catch(() => null);
      }}
      disabled={isConnecting}
      aria-label={isConnected ? 'End voice chat' : 'Start voice chat with Kasun'}
      title={isConnected ? 'Voice connected — double-click to mute/unmute' : 'Talk to Kasun'}
      className={[
        'absolute right-12 bottom-2',
        'w-9 h-9 rounded-full',
        'flex items-center justify-center flex-shrink-0',
        'transition-colors duration-150 motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:shadow-focus',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        isConnected
          ? isMicrophoneEnabled
            ? 'bg-purple-600 text-white hover:bg-purple-700'
            : 'bg-red-500 text-white hover:bg-red-600'
          : 'bg-gray-100 dark:bg-[#2A2438] text-gray-600 dark:text-[#A79FBB] hover:bg-gray-200 dark:hover:bg-[#3A3350]',
      ].join(' ')}
    >
      {isConnecting ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isConnected && !isMicrophoneEnabled ? (
        <MicOff className="w-4 h-4" />
      ) : (
        <Mic className="w-4 h-4" />
      )}
    </button>
  );
}
