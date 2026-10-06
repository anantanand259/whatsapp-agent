import path from 'node:path';
import { Artifacts } from './artifacts.js';
const artifacts = new Artifacts(path.resolve('demo-output'), 'offline-demo');
await artifacts.document({ filename: 'agent-guide.docx', title: 'Your WhatsApp Work Agent', sections: [
  { heading: 'From request to result', body: 'Send an instruction in Message yourself. The agent chooses tools to create files, prepare documents or presentations, and return the result to your WhatsApp chat.' },
  { heading: 'GitHub workflow', body: 'When explicitly requested, selected generated files are committed together to your configured repository and branch. Website hosting is a separate step.' }
] });
await artifacts.presentation({ filename: 'agent-overview.pptx', title: 'Work, From Your WhatsApp', slides: [
  { title: 'Ask. Create. Receive.', bullets: ['Give instructions in your self-chat', 'Create editable documents and presentations', 'Receive generated files in the same conversation'], notes: 'This deck is a deterministic offline sample, not AI-generated.' },
  { title: 'Connected to your workflow', bullets: ['Read recent chats on request', 'Send messages to configured contacts', 'Commit generated website files to GitHub'], notes: 'Live operations require credentials and WhatsApp QR pairing.' }
] });
console.log(`Created offline sample Word document and PowerPoint deck: ${artifacts.root}`);
