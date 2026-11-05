// The people in the demo office (shown when nobody is signed in), and the status list
// shared with the live office. Signed-in owners see their real team from Supabase instead.
//
// status: working | waiting | break | lunch | idle | paused | commute
// at:     seat position in office-local studs [x, z]; yaw = facing (radians)
// pose:   type | typeBack | gesture | restBack | sip | eat | eatBack | idleBack | paddle | paddleBack | walk
// script: kai | leo | mara  (people who walk a scripted path instead of sitting)

const PI = Math.PI;

export const STATUS = {
  working: { label: 'Working', color: '#3d8bff' },
  waiting: { label: 'Waiting for you', color: '#ff5c8a' },
  break: { label: 'On break', color: '#ffb020' },
  lunch: { label: 'Lunch', color: '#ff7a3d' },
  idle: { label: 'Idle', color: '#a0a8b5' },
  paused: { label: 'Paused', color: '#5b6472' },
  commute: { label: 'Commuting', color: '#a77bff' }
};

export const AGENTS = [
  { id: 'nova', name: 'Nova', role: 'Research agent', status: 'working', zone: 'Workspace', desk: 'Desk 01', task: 'Summarizing competitor research', since: '1h 12m', shirt: '#7c5cff', pants: '#2b3a67', skin: '#f5cd30', hair: '#3b2418', hairStyle: 'long', at: [6, 4.6], yaw: 0, pose: 'type' },
  { id: 'atlas', name: 'Atlas', role: 'Support agent', status: 'working', zone: 'Workspace', desk: 'Desk 02', task: 'Answering support tickets', since: '2h 05m', shirt: '#13b38a', pants: '#2f3542', skin: '#8d5a3a', hair: '#1a1515', hairStyle: 'short', at: [12, 4.6], yaw: 0, pose: 'type' },
  { id: 'pixel', name: 'Pixel', role: 'Design agent', status: 'working', zone: 'Meeting room', desk: 'Desk 03', task: 'Design review with Byte', since: '24m', shirt: '#ff5c8a', pants: '#3d3a5c', skin: '#ffd7b5', hair: '#f2b33d', hairStyle: 'long', at: [60, 2.6], yaw: 0, pose: 'gesture' },
  { id: 'ledger', name: 'Ledger', role: 'Finance agent', status: 'working', zone: 'Workspace', desk: 'Desk 04', task: 'Reconciling November invoices', since: '48m', shirt: '#5aa02c', pants: '#2b3a67', skin: '#f5cd30', hair: '#6b3f22', hairStyle: 'short', at: [12, 13.4], yaw: PI, pose: 'type' },
  { id: 'echo', name: 'Echo', role: 'QA agent', status: 'break', zone: 'Coffee room', desk: 'Desk 05', task: 'Coffee break', since: '6m', shirt: '#ffb020', pants: '#3b4252', skin: '#b67a50', hair: '#1a1515', hairStyle: 'short', at: [61.2, 20], yaw: PI / 2, pose: 'sip' },
  { id: 'quill', name: 'Quill', role: 'Content agent', status: 'break', zone: 'Break room', desk: 'Desk 06', task: 'Ping-pong with Juno', since: '11m', shirt: '#2f9bff', pants: '#2f3542', skin: '#ffd7b5', hair: '#a8532c', hairStyle: 'long', at: [19.4, 51], yaw: -PI / 2, pose: 'paddle' },
  { id: 'relay', name: 'Relay', role: 'Ops agent', status: 'idle', zone: 'Workspace', desk: 'Desk 07', task: 'Waiting for the next task', since: '19m', shirt: '#d6336c', pants: '#2b3a67', skin: '#e0ac80', hair: '#3b2418', hairStyle: 'short', at: [21, 13.4], yaw: PI, pose: 'idle' },
  { id: 'kai', name: 'Kai', role: 'Marketing agent', status: 'break', zone: 'Coffee room', desk: 'Desk 08', task: 'Getting a coffee refill', since: '2m', shirt: '#12b886', pants: '#3b4252', skin: '#f5cd30', hair: '#1a1515', hairStyle: 'short', script: 'kai' },
  { id: 'sage', name: 'Sage', role: 'Legal agent', status: 'working', zone: 'Workspace', desk: 'Desk 09', task: 'Reviewing a vendor contract', since: '37m', shirt: '#7048e8', pants: '#2f3542', skin: '#ffd7b5', hair: '#9aa0a6', hairStyle: 'short', at: [36, 4.6], yaw: 0, pose: 'type' },
  { id: 'byte', name: 'Byte', role: 'Engineering agent', status: 'working', zone: 'Meeting room', desk: 'Desk 10', task: 'Sprint planning with Pixel', since: '24m', shirt: '#fd7e14', pants: '#2b3a67', skin: '#8d5a3a', hair: '#3b2418', hairStyle: 'short', at: [72, 11.4], yaw: PI, pose: 'rest' },
  { id: 'juno', name: 'Juno', role: 'People agent', status: 'break', zone: 'Break room', desk: 'Desk 11', task: 'Ping-pong with Quill', since: '11m', shirt: '#e8590c', pants: '#3d3a5c', skin: '#e0ac80', hair: '#f2b33d', hairStyle: 'long', at: [6.6, 51], yaw: PI / 2, pose: 'paddle' },
  { id: 'scout', name: 'Scout', role: 'Sales agent', status: 'lunch', zone: 'Lunch room', desk: 'Desk 12', task: 'Lunch break', since: '22m', shirt: '#20c997', pants: '#2f3542', skin: '#b67a50', hair: '#6b3f22', hairStyle: 'short', at: [36, 34.6], yaw: 0, pose: 'eat' },
  { id: 'orbit', name: 'Orbit', role: 'Data agent', status: 'lunch', zone: 'Lunch room', desk: 'Hot desk', task: 'Lunch break', since: '15m', shirt: '#82c91e', pants: '#3b4252', skin: '#f5cd30', hair: '#1a1515', hairStyle: 'short', at: [44, 48.4], yaw: PI, pose: 'eat' },
  { id: 'leo', name: 'Leo', role: 'Night-shift lead', status: 'commute', zone: 'Parking', desk: 'Hot desk', task: 'Clocking out · driving home', since: '1m', shirt: '#4c6ef5', pants: '#2f3542', skin: '#e0ac80', hair: '#3b2418', hairStyle: 'short', script: 'leo' },
  { id: 'mara', name: 'Mara', role: 'Afternoon-shift agent', status: 'commute', zone: 'Parking', desk: 'Hot desk', task: 'Arriving for the afternoon shift', since: '1m', shirt: '#e64980', pants: '#3d3a5c', skin: '#ffd7b5', hair: '#a8532c', hairStyle: 'long', script: 'mara' }
];
