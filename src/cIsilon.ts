import axios from "axios";
import * as https from "https";
import axiosCookieJarSupport from "axios-cookiejar-support";
import * as tough from "tough-cookie";
axiosCookieJarSupport(axios);

interface Account {
  username: string;
  password: string;
}

interface Info {
  name: string;
  model: string;
}

interface Capacity {
  total: number;
  used: number;
  free: number;
  available: number;
  configured: number;
  unconfigured: number;
  vhs: number;
}

interface Result {
  server: any;
  info: Info;
  disks?: any;
  datastores?: any;
  capacity?: Capacity;
  [key: string]: any;
}

export default class cIsilon {
  private server: any;
  private headersBasic: any;
  private dataLogin: any;
  private httpsAgent: any;
  private cookieJar: any;
  private configInfo: any;
  private configLogin: any;
  private configDisks: any;
  private configCapacity: any;
  private configDatastores: any;
  private configAlerts: any;
  private configUptime: any;
  

  constructor(server: any, account: Account) {
    this.server = server;

    this.headersBasic = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    this.dataLogin = {
      username: account.username,
      password: account.password,
      services: ["platform", "namespace"],
    };

    this.httpsAgent = new https.Agent({
      requestCert: true,
      rejectUnauthorized: false, //connection is encrypted but MITM attack is possible. Use only in safe networks
      //ca: fs.readFileSync('/etc/pki/tls/certs/CA.crt'),
      //cert: fs.readFileSync('/etc/pki/tls/certs/server.cer'),
      //key: fs.readFileSync('/etc/pki/tls/private/server.key')
    });

    this.cookieJar = new tough.CookieJar();

    this.configLogin = {
      method: "post",
      proxy: false,
      httpsAgent: this.httpsAgent,
      url: `https://${server.ip}:8080/session/1/session`,
      headers: this.headersBasic,
      jar: this.cookieJar,
      withCredentials: true,
      data: this.dataLogin,
    };

    this.configInfo = {
      method: "get",
      proxy: false,
      httpsAgent: this.httpsAgent,
      url: `https://${server.ip}:8080/platform/1/cluster/config`,
      headers: this.headersBasic,
      jar: this.cookieJar,
      withCredentials: true,
    };

    this.configDisks = {
      method: "get",
      proxy: false,
      httpsAgent: this.httpsAgent,
      url: `https://${server.ip}:8080/platform/3/cluster/nodes/ALL/drives/ALL`,
      headers: this.headersBasic,
      jar: this.cookieJar,
      withCredentials: true,
    };

    this.configCapacity = {
      method: "get",
      proxy: false,
      httpsAgent: this.httpsAgent,
      url: `https://${server.ip}:8080/platform/1/statistics/current?key=ifs.bytes.total&key=ifs.bytes.used&key=ifs.bytes.free&key=ifs.bytes.avail&devid=all`,
      headers: this.headersBasic,
      jar: this.cookieJar,
      withCredentials: true,
    };

    this.configDatastores = {
      method: "get",
      proxy: false,
      httpsAgent: this.httpsAgent,
      url: `https://${server.ip}:8080/platform/1/quota/quotas?keys=all`,
      headers: this.headersBasic,
      jar: this.cookieJar,
      withCredentials: true,
    };

    this.configAlerts = {
        method: 'get',
        proxy: false,
        httpsAgent: this.httpsAgent,
        url: `https://${server.ip}:8080/platform/3/event/eventgroup-occurrences?resolved=false&ignore=false`,
        headers : this.headersBasic,
        jar: this.cookieJar,
        withCredentials: true
    }

    this.configUptime = {
        method: 'get',
        proxy: false,
        httpsAgent: this.httpsAgent,
        url: `https://${server.ip}:8080/platform/1/statistics/current?key=node.uptime&devid=all`,
        headers : this.headersBasic,
        jar: this.cookieJar,
        withCredentials: true
    }    
 
  }

  async request(commands: Array<string>) {
    let result: Result = {
      server: this.server,
      info: { name: "", model: "" },
    };

    try {
      const thisClass = this;

      await axios(thisClass.configLogin).then(async function (login) {
        await axios(thisClass.configInfo).then(async function (info) {
          result.info["name"] = info.data["name"];
          result.info["model"] =
            info.data["onefs_version"]["type"] +
            " " +
            info.data["onefs_version"]["release"] +
            " " +
            info.data["onefs_version"]["build"];
        });

        //process commands
        for (const command of commands) {
          result[command] = [];

          switch (command) {
            case "disks": {
              await axios(thisClass.configDisks).then(async function (
                response
              ) {
                for (const node of response.data.nodes) {
                  result[command] = result[command].concat(node.drives);
                }
              });
              break;
            } //case disks

            case "capacity": {
              await axios(thisClass.configCapacity).then(async function (
                response
              ) {
                let cpo: any = {};
                response.data["stats"].forEach(
                  (el: any) => (cpo[el.key] = el.value)
                );

                //capacity [kBytes]
                let capacity: Capacity = {
                  total: 0,
                  used: 0,
                  free: 0,
                  available: 0,
                  configured: 0,
                  unconfigured: 0,
                  vhs: 0,
                };

                capacity.total = cpo["ifs.bytes.total"] / 1024;
                capacity.used = cpo["ifs.bytes.used"] / 1024;
                capacity.available = cpo["ifs.bytes.avail"] / 1024;
                capacity.vhs =
                  capacity.total - capacity.used - capacity.available;
                capacity.free = capacity.available;
                capacity.configured = capacity.used + capacity.available;

                result[command] = capacity;
              });
              break;
            } //case capacity

            case "datastores": {
              await axios(thisClass.configDatastores).then(async function (
                response
              ) {
                let datastores = response.data["quotas"].map((quota: any) => {
                  let datastore: any = {};
                  datastore["name"] = quota["path"].replace("/ifs/", "");
                  datastore["wwn"] = quota["path"];
                  datastore["usage"] = quota["usage"];
                  datastore["size"] =
                    Number(quota["thresholds"]["hard"]) / 1024; //kBytes
                  datastore["health"] = null;
                  return datastore;
                });

                result[command] = datastores;
              });
              break;
            } //case datastores
              
            case 'alerts': {

                await axios(thisClass.configAlerts).then(async function(response: any) {

                    result[command] = response.data["eventgroups"].map(function(el:any) {

                        delete el.ignore
                        delete el.ignore_time
                        delete el.resolve_time
                        delete el.resolved
                        delete el.resolver
                        el['last_event'] = moment.unix(el['last_event']).toISOString()
                        el['time_noticed'] = moment.unix(el['time_noticed']).toISOString()
                        el['specifier'] = JSON.stringify(el['specifier'])
                        el['causes'] = JSON.stringify(el['causes'])
                        el['channels'] = JSON.stringify(el['channels'])
                        return el;
                    })

                })
                break;
            } //case alerts

            //storage nodes uptime
            case 'uptime': {

                await axios(thisClass.configUptime).then(async function(response: any) {

                    result[command] = response.data["stats"].map((node:any) => {
                        let nNode = { 
                            node: 'Node ' + node['devid'], 
                            time: node['time'], 
                            uptime: node['value'] 
                        }
                        return nNode;
                    })

                })
                break;
            } //case uptime
                            
          } //switch
        } //for commands
      });
    } catch (error) {
      console.log(this.server, "Error: ", error);
    } finally {
      //TODO: correct Log Out
      this.cookieJar = null;
    }

    return result;
  } //request
} //class
