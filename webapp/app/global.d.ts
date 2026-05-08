declare module 'dify-client';
declare module 'uuid';

type SpeechRecognitionEvent = any
type SpeechRecognitionResultList = any
type SpeechRecognitionResult = any
type SpeechRecognitionAlternative = any
type SpeechRecognitionErrorEvent = any
type SpeechRecognition = any
type SpeechRecognitionConstructor = any

interface Window {
  SpeechRecognition?: new () => SpeechRecognition
  webkitSpeechRecognition?: new () => SpeechRecognition
}
