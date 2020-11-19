import axios from "axios";
import * as https from "https";

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
}

interface Result {
  server: any;
  info: Info;
  datastores?: any;
  capacity?: Capacity;
  [key: string]: any;
}

export default class cDataDomain {
  private server: any;
  private headersBasic: any;
  private headersToken: any;
  private httpsAgent: any;
  private configLogin: any;
  private configLogout: any;
  private configInfo: any;
  private configMtrees: any;
  private configAlerts: any;

  constructor(server: any, account: Account) {
    
    this.server = server;

    var axiosTimeout = 5000
    
    this.headersBasic = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    this.headersToken = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-DD-AUTH-TOKEN": "",
    };

    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false, //connection is encrypted but MITM attack is possible. Use only in safe networks
    });

    this.configLogin = {
      method: "post",
      proxy: false,
      httpsAgent: this.httpsAgent,
      url: `https://${server.ip}:3009/rest/v1.0/auth`,
      headers: this.headersBasic,
      timeout: axiosTimeout,
      data: {
        auth_info: { username: account.username, password: account.password },
      },
    };

    this.configLogout = {
      method: "delete",
      proxy: false,
      httpsAgent: this.httpsAgent,
      url: `https://${server.ip}:3009/rest/v1.0/auth`,
      timeout: axiosTimeout,
      headers: this.headersToken,
    };

    this.configInfo = {
      method: "get",
      proxy: false,
      httpsAgent: this.httpsAgent,
      url: `https://${server.ip}:3009/rest/v1.0/system`,
      timeout: axiosTimeout,
      headers: this.headersToken,
    };

    this.configMtrees = {
      method: "get",
      proxy: false,
      httpsAgent: this.httpsAgent,
      url: `https://${server.ip}:3009/rest/v1.0/dd-systems/0/mtrees`,
      timeout: axiosTimeout,
      headers: this.headersToken,
    };
    
    // TODO: alerts info
    this.configAlerts = {
        method: 'get',
        proxy: false,
        httpsAgent: this.httpsAgent,
        url: `https://${server.ip}:3009/rest/v1.0/dd-systems/0/alerts/notify-lists`, ///notify-lists/default
        timeout: axiosTimeout,
        headers : this.headersToken
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
        thisClass.headersToken["X-DD-AUTH-TOKEN"] =
          login.headers["x-dd-auth-token"];

        await axios(thisClass.configInfo).then(async function (info) {
          //result.info = info.data
          result.info["name"] = info.data["name"];
          result.info["model"] =
            info.data["model"] +
            " " +
            info.data["location"] +
            " " +
            info.data["version"];

          //capacity [kBytes]
          let capacity: Capacity = {
            total: 0,
            used: 0,
            free: 0,
            available: 0,
            configured: 0,
            unconfigured: 0,
          };
          capacity.total = info.data["physical_capacity"]["total"] / 1024;
          capacity.used = info.data["physical_capacity"]["used"] / 1024;
          capacity.available =
            info.data["physical_capacity"]["available"] / 1024;
          capacity.free = capacity.available;
          capacity.configured = capacity.used + capacity.available;
          result["capacity"] = capacity;

          //process commands
          for (const command of commands) {
            if (!(command in result)) result[command] = [];

            switch (command) {
              // actually trees, not datastores
              case "datastores": {
                await axios(thisClass.configMtrees).then(async function (
                  response
                ) {
                  let mtrees: any = response.data["mtree"];

                  await Promise.all(
                    mtrees.map(function (mtree: any) {
                      let configMtree = { ...thisClass.configMtrees };
                      configMtree.url += "/" + mtree.id;
                      return axios(configMtree);
                    })
                  )
                    .then(function (responses) {
                      responses.forEach(function (response: any) {
                        let mtree: any = {};
                        mtree["name"] = response["data"]["name"]
                          .split("/")
                          .slice(-1)[0];
                        mtree["wwn"] = response["data"]["id"];
                        mtree["size"] =
                          Number(response["data"]["logical_capacity"]["used"]) /
                          1024; //kBytes
                        mtree["health"] = null;

                        result[command].push(mtree);
                      });
                    })
                    .catch((error) => {
                      console.log(error);
                    });
                });
                break;
              } //case mtrees
                
              //TODO: alerts info
              case 'alerts': {

                  await axios(thisClass.configAlerts).then(async function(response: any) {

                      result[command] = response.data["notify_lists"]

                  })
                  break;
              } //case alerts   

              //storage module uptime
              case 'uptime': {

                  result[command] = [
                      {
                          node: info.data['model'], 
                          time: Math.floor(new Date().getTime() / 1000), 
                          uptime: info.data['uptime_secs']
                      }
                  ]
                  break;
              } //case uptime                   
                
            } //switch
          } //commands
        }); //axios configInfo
      }); //axios configLogin
    } catch (error) {
      console.log(this.server, "Error: ", error);
    } finally {
      if (this.headersToken["X-DD-AUTH-TOKEN"] !== "") {
        await axios(this.configLogout).then(function (logout) {
          //console.log("LogOut: " + JSON.stringify(logout.data))
        });
      }
    }

    return result;
  } //request
} //class
