import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RoomAssistant, voiceInputProblem } from './RoomAssistant';
import { SharedAudio } from '../fx/audio';

type Handler = ((event: unknown) => void) | null;
class FakeRecognizer {
  static last: FakeRecognizer | null = null;
  lang = ''; interimResults = false; continuous = false;
  onresult: Handler = null; onerror: Handler = null; onend: Handler = null;
  start = vi.fn(() => { FakeRecognizer.last = this; });
  stop = vi.fn(); abort = vi.fn();
  say(text: string) { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] }); }
}
class FakeUtterance { onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(public text: string) {} }

function installSpeech({ recognition = true, synth = true } = {}) {
  const speak = vi.fn(); const cancel = vi.fn();
  vi.stubGlobal('SpeechRecognition', recognition ? FakeRecognizer : undefined);
  vi.stubGlobal('webkitSpeechRecognition', undefined);
  vi.stubGlobal('speechSynthesis', synth ? { speak, cancel, getVoices: () => [] } : undefined);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  return { speak, cancel };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); FakeRecognizer.last = null; });

describe('room assistant', () => {
  it('explains insecure pages and unsupported browsers while typing still works', async () => {
    expect(voiceInputProblem({ isSecureContext: false })).toBe('Voice needs a secure (https) page. Type your request.');
    installSpeech({ recognition: false });
    const onCommand = vi.fn(async () => ({ reply: 'Harbor Hawks 42, Summit Foxes 39.' }));
    render(<RoomAssistant busy={false} onCommand={onCommand} />);
    expect(screen.getByText('Voice input is not supported in this browser. Type your request.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Speak command' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Ask assistant'), { target: { value: "what's the score" } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Harbor Hawks 42, Summit Foxes 39.')).toBeTruthy();
  });

  it('speaks the reply to a spoken request, not to a typed one, and yields sound while listening', async () => {
    const { speak, cancel } = installSpeech();
    const audio = new SharedAudio(() => null);
    const speaking = vi.spyOn(audio, 'setSpeaking');
    const onCommand = vi.fn(async () => ({ reply: 'Three accepted.', accepted: true }));
    render(<RoomAssistant busy={false} onCommand={onCommand} audio={audio} />);
    fireEvent.click(screen.getByRole('button', { name: 'Speak command' }));
    expect(cancel).toHaveBeenCalled();
    expect(speaking).toHaveBeenLastCalledWith(true);
    await act(async () => { FakeRecognizer.last!.say('I choose three'); });
    expect(onCommand).toHaveBeenCalledWith('I choose three');
    expect(await screen.findByText('Three accepted.')).toBeTruthy();
    expect((speak.mock.calls.at(-1)![0] as FakeUtterance).text).toBe('Three accepted.');
    const spoken = speak.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Ask assistant'), { target: { value: 'what is my rank' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('You: what is my rank');
    expect(speak.mock.calls.length).toBe(spoken);
  });

  it('shows microphone denial and keeps typed input available', () => {
    installSpeech();
    render(<RoomAssistant busy={false} onCommand={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Speak command' }));
    act(() => { FakeRecognizer.last!.onerror?.({ error: 'not-allowed' }); });
    expect(screen.getByLabelText('Ask assistant')).toBeTruthy();
    expect(document.querySelector('.rm-assistant-state')!.textContent).toBe('Microphone blocked. Allow mic access, or type instead.');
  });

  it('never retries a request whose result is unknown', async () => {
    installSpeech();
    const onCommand = vi.fn(async () => undefined);
    render(<RoomAssistant busy={false} onCommand={onCommand} />);
    fireEvent.change(screen.getByLabelText('Ask assistant'), { target: { value: 'three' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Could not confirm that request. Check the game view before trying again.')).toBeTruthy();
    expect(onCommand).toHaveBeenCalledTimes(1);
  });

  it('follows a navigate hint from the server', async () => {
    installSpeech();
    const onNavigate = vi.fn();
    render(<RoomAssistant busy={false} onNavigate={onNavigate} onCommand={async () => ({ reply: 'Maya leads the season.', navigate: 'season' })} />);
    fireEvent.change(screen.getByLabelText('Ask assistant'), { target: { value: 'show season standings' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Maya leads the season.');
    expect(onNavigate).toHaveBeenCalledWith('season');
  });
});
