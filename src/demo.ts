export type Stage='arrived'|'diagnosis'|'approval'|'repair'|'pickup';
export type Job={id:string;vehicle:string;plate:string;mileage?:number;complaint:string;stage:Stage;assignee?:string;amount?:number;priority?:'normal'|'urgent'};
export const jobs:Job[]=[
{id:'184',vehicle:'BMW X3 3.0i',plate:'SAD XX 123',mileage:247318,complaint:'Motorkontrollleuchte leuchtet seit gestern.',stage:'arrived',priority:'urgent'},
{id:'185',vehicle:'Opel Astra',plate:'SAD AB 816',complaint:'Geräusch vorne rechts bei Unebenheiten.',stage:'arrived'},
{id:'181',vehicle:'VW Golf VII',plate:'SAD GT 400',complaint:'Bremsgeräusch Vorderachse.',stage:'diagnosis',assignee:'Max'},
{id:'176',vehicle:'Audi A4',plate:'SAD AU 91',complaint:'Querlenker vorne rechts ausgeschlagen.',stage:'approval',amount:486.20},
{id:'173',vehicle:'Mercedes C220',plate:'R MC 802',complaint:'Bremsscheiben und Beläge Vorderachse.',stage:'repair',assignee:'Peter'},
{id:'169',vehicle:'Skoda Octavia',plate:'SAD SO 12',complaint:'Inspektion abgeschlossen.',stage:'pickup'}];
