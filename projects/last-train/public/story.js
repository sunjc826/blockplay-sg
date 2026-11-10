/** @typedef {{label: string, hint: string, next: string}} Choice */
/** @typedef {{title: string, place: string, time: string, text: string, choices: Choice[], ending?: string}} Scene */
/** @type {Record<string, Scene>} */
export const scenes = {
  arrival: {
    title: 'One last departure.', place: 'Marina Bay · Platform 02', time: '23:59',
    text: 'The last train arrives without a sound. Every carriage is empty, except for a woman holding a yellow umbrella. Your phone lights up. A message from your own number: whatever you do, do not miss this train. The doors begin to close.',
    choices: [{label:'Step inside',hint:'Follow the woman with the umbrella',next:'carriage'},{label:'Stay on the platform',hint:'Find out who sent the message',next:'platform'}],
  },
  carriage: {
    title: 'She saved you a seat.', place: 'Carriage 07 · In transit', time: '00:01',
    text: 'The woman smiles. You are late, she says. Outside, the city runs backwards: rain rises into clouds, a fallen cup becomes whole. She offers you the umbrella. At the far end of the carriage, the driver is calling your name.',
    choices: [{label:'Take the umbrella',hint:'Ask her how she knows you',next:'stranger'},{label:'Find the driver',hint:'Follow your name through the train',next:'signal'}],
  },
  platform: {
    title: 'The station remembers.', place: 'Marina Bay · Empty platform', time: '00:01',
    text: 'The train leaves. Your phone rings from inside the station intercom. Your own voice whispers: I waited too. Then the departure board changes. One train remaining. Destination: the day you wish you could change. A service door clicks open.',
    choices: [{label:'Open the service door',hint:'Trace the voice behind the wall',next:'signal'},{label:'Walk toward the exit',hint:'Some things belong in the past',next:'daybreak'}],
  },
  stranger: {
    title: 'A small kindness.', place: 'Carriage 07 · Between days', time: '00:03',
    text: 'Years ago, you lent this umbrella to a stranger in the rain. You never got it back. I was on my way to say goodbye, she says. Your kindness gave me the courage to go. Tonight, I can take you back to one moment. Or I can take you home.',
    choices: [{label:'Visit that rainy day',hint:'See what one small act changed',next:'memory'},{label:'Ask to go home',hint:'Carry the story forward',next:'home'}],
  },
  signal: {
    title: 'The voice is yours.', place: 'Signal room · Outside time', time: '00:04',
    text: 'There is no driver. Only a microphone, a yellow umbrella, and a recording of your voice. You sent the warning. You brought yourself here. A switch has two positions: send the message again, or let the next morning arrive.',
    choices: [{label:'Send the warning',hint:'Give your past self another chance',next:'loop'},{label:'Let morning arrive',hint:'Put the microphone down',next:'home'}],
  },
  daybreak: {
    title: 'You choose tomorrow.', place: 'Marina Bay · Street level', time: '06:12', ending: 'The first light',
    text: 'You climb the stairs into morning. A cleaner waves. The city smells of coffee and wet pavement. Your phone holds one new message: good choice. You delete it, buy two coffees, and give one away. Some mysteries are invitations to keep living.', choices: [],
  },
  memory: {
    title: 'You were already enough.', place: 'A bus stop · Years ago', time: '17:42', ending: 'The borrowed umbrella',
    text: 'You stand at the old bus stop. Your younger self offers a yellow umbrella to a crying stranger. She catches her bus. Through its window, someone reaches for her hand. You cannot change the past. But now you know: you made a difference. You always did.', choices: [],
  },
  home: {
    title: 'The city moves forward.', place: 'Your stop · A new morning', time: '06:12', ending: 'The way home',
    text: 'You close your eyes. When you open them, sunlight fills an ordinary train. A yellow umbrella rests beside you. Your phone is quiet. At your stop, someone is waiting in the rain. This time, you know exactly what to do.', choices: [],
  },
  loop: {
    title: 'One more chance.', place: 'Marina Bay · Platform 02', time: '23:59', ending: 'The echo',
    text: 'You press record. Whatever you do, do not miss this train. The room dissolves into platform lights. Somewhere, your phone lights up. The last train arrives without a sound. This time, you are the one holding the yellow umbrella.', choices: [],
  },
};
export const opening = 'arrival';
export const endingCount = Object.values(scenes).filter(scene => scene.ending).length;
