#!/usr/bin/env node

//Asynchronously calling multiple storages

import { accounts } from './accounts';
import cIsilon from './cIsilon';
import cXIO from './cXIO';
import cUnity from './cUnity';
import cDataDomain from './cDataDomain';
import cVNX from './cVNX';

const servers:any = [
    {ip:"10.0.0.10", storage:"Isilon", location:"Amsterdam", id:"ISI_01"},
    {ip:"10.0.0.11", storage:"XIO", location:"Ljubljana", id:"XIO_01", cluster: "1"},
    {ip:"10.0.0.12", storage:"Unity", location:"Amsterdam", id:"UNI_01"},
    {ip:"10.0.0.13", storage:"VNX", location:"Ljubljana", id:"VNX_01"},
    {ip:"10.0.0.14", storage:"DataDomain", location:"Ljubljana", id:"DD_01"},
]

Promise.all(servers.map((server:any) => {

        let cs:any = null;

        switch(server.storage) {
            case 'Isilon': { cs = new cIsilon(server, accounts.isilon); break; }
            case 'Unity': { cs = new cUnity(server, accounts.unity); break;     }
            case 'XIO': { cs = new cXIO(server, accounts.xio); break; }
            case 'DataDomain': { cs = new cDataDomain(server, accounts.datadomain); break; }
            case 'VNX': { cs = new cVNX(server, accounts.vnx); break; }
        }

        return cs.request(['capacity','datastores']);
    }))

    .then( (results:any) => {
        if (results) {


            for (let result of results) {
    
                //info is gathered by default
                console.log(result['info'])
                console.log(result['capacity'])
                console.log(result['datastores'])
            }

            const fs = require('fs');
            let data = JSON.stringify(results);
            fs.writeFileSync('data.json', data);

        } //if-results
    })

    .catch( (error) => {
        console.log(error)
    })


