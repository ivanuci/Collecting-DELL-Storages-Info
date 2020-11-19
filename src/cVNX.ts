import { parseString } from 'xml2js'
const { spawn } = require('child_process')

interface Account {
    username: string,
    password: string
}

interface Info {
    name: string,
    model: string
}

interface Capacity {
    total: number,
    used: number,
    free: number,
    available: number,
    configured: number,
    unconfigured: number
}

interface Result {
    server: any,
    info: Info,
    disks?: any,
    datastores?: any,
    capacity?: Capacity,
    [key: string]: any
}

export default class cVNX {
  
    private server: any;
    private account: Account

    constructor(server: any, account: Account){

        this.server = server;
        this.account = account;
    }

    async request(commands:Array<string>) {

        const thisClass = this

        let result:Result = {
            server: this.server,
            info: { name:'', model:'' }
        };

        let naviseccli:any = async function(server:any, account:Account, args:string, extParamvalue:boolean = true) {
            
            let paramArray:any = []
            let login = ['-User', account.username, '-Password', account.password, '-Scope', '0', '-Timeout', "10", '-Xml', '-h', server]

            try {
                let response = spawn('/opt/Navisphere/bin/naviseccli', login.concat(args.split(" ")))
            
                let dataXml = ''
                for await (const data of response.stdout) {
                    dataXml += data.toString().replace(/[\r\n]/g,'')
                }
    
                await parseString(dataXml, function (err:any, data:any) {
                    if (data && 'CIM' in data) {
                        paramArray = data['CIM']['MESSAGE'][0]['SIMPLERSP'][0]['METHODRESPONSE'][0]['PARAMVALUE']   //pools, alerts
                        if (extParamvalue) paramArray = paramArray[0]['VALUE'][0]['PARAMVALUE']                     //others    
                    }
                })    
            }
            catch (err){
                console.log(err)
            }

            return paramArray;
        }

        try {

            //info
            let agent:any = {}
            let params = await naviseccli(thisClass.server.ip, thisClass.account,'getagent')
            
            if (!(params && params.length > 0)) throw new Error("VNX Info missing!");
            
            params.forEach(function (el:any) {
                agent[el['$']['NAME']] = el['VALUE'][0]
            })

            result.info['name'] = agent['Name'] + " " + agent["Node"]
            result.info['model'] = agent["Model"]

            //process commands                
            for (const command of commands) {

                if (!(command in result)) result[command] = []

                switch(command) {

                    case 'capacity':
                    case 'disks': {

                        if (result[command] && result[command].length === 0) {

                            let disks:any = []
                            let disk:any = null
                            let params:any = await naviseccli(thisClass.server.ip, thisClass.account, 'getdisk -bind -capacity -actualcapacity -userlba -lun -private -product -rb -rev -serial -state -vendor -rg -cpn -drivetype -tla -usercapacity -speeds -powersavingsdiskcapable -powersavingsdiskeligible -powersavingsstate')
                            const regex = RegExp('^Bus .*');
                            params.forEach(function (el:any) {
                                if (regex.test(el['$']['NAME'])) {
                                    if (disk) disks.push(disk)
                                    disk = {}
                                    disk['Disk'] = el['$']['NAME']
                                }
                                else disk[el['$']['NAME']] = el['VALUE'][0]
                            })
                            if (disk) disks.push(disk)

                            result['disks'] = disks
                            
                            //capacity [kBytes]
                            //unconfigured = Free Raw Disks, free = Free Storage Pools
                            let capacity:Capacity = { total:0, used :0, free:0, available:0, configured:0, unconfigured:0 }

                            let pools = await naviseccli(thisClass.server.ip, thisClass.account, 'storagepool -list -capacities', false)
                            pools.forEach(function (el:any) {
                                if (el['$']['NAME'] === 'Available Capacity (Blocks)') capacity.free += Number(el['VALUE'][0])
                            })
                            capacity.free = capacity.free / 2   // 1 Block == 0,5 kByte

                            disks.forEach((disk:any) => {
                                if (disk["State"] !== "Empty") {
                                    capacity.total += Number(disk["Actual Capacity"]);
                                    if (disk["State"] === "Unbound") capacity.unconfigured += Number(disk["Actual Capacity"])    
                                }
                            })

                            capacity.total = capacity.total * 1024
                            capacity.unconfigured = capacity.unconfigured * 1024
                            capacity.available = capacity.unconfigured + capacity.free
                            capacity.used =  capacity.total - capacity.available
                            capacity.configured = capacity.used + capacity.free
                            result['capacity'] = capacity
                        }
                        break;
                    } //case disks

                    case 'datastores': {

                        let ds:any = null
                        let dss:any = []
                        let params:any = await naviseccli(thisClass.server.ip, thisClass.account, 'lun -list -uid -capacities -status -aa -at -alOwner -tiers -tieringPolicy -initialTier -allowSnapAutoDelete -allocationPolicy -owner -default -state -drivetype -rtype -poolName -isPoolLUN -isThinLUN -isPrivate -isCompressed')

                        const regex = RegExp('^LOGICAL UNIT NUMBER .*');
                        params.forEach(function (el:any) {
                            if (regex.test(el['$']['NAME'])) {
                                if (ds) dss.push(ds)
                                ds = {}
                            }
                            ds[el['$']['NAME']] = el['VALUE'][0]
                        })
                        if (ds) dss.push(ds)

                        dss = dss.map((lun:any) => {
                            let nlun:any = {}
                            nlun['name'] = lun['Name']
                            nlun['wwn'] = lun['UID']
                            nlun['size'] = Number(lun['LUN Allocation (Blocks)']) / 2 //kBytes
                            nlun['health'] = lun['Status']
                            return nlun;
                        })

                        result[command] = dss
                        break;
                    } //case datastores
                        
                    case 'alerts': {

                        let alerts:any = []
                        let params:any = await naviseccli(thisClass.server.ip, thisClass.account, 'faults -list', false)

                        params.forEach(function (el:any) {
                            alerts.push({'Name':el['$']['NAME'], 'Value':el['VALUE'][0]})
                        });

                        result[command] = alerts
                        break;
                    } //case alerts
                    
                    //storage processors uptime
                    case 'uptime': {

                        let sps:any = {}

                        /*let paramsTime:any = await naviseccli(thisClass.server.ip, thisClass.account, 'getsptime', true)
                        paramsTime.forEach(function (el:any) {
                            let time = new Date(el['VALUE'][0]).getTime() / 1000
                            //Math.floor(new Date().getTime() / 1000)
                            sps[el['$']['NAME'].replace('Time on ', '')] = { time:0, uptime:0 }
                            sps[el['$']['NAME'].replace('Time on ', '')]['time'] = time
                        });*/

                        let paramsUptime:any = await naviseccli(thisClass.server.ip, thisClass.account, 'getspuptime', false)
                        paramsUptime.forEach(function (el:any) {
                            // convert uptime "391 days 18 hours 14 minutes" to seconds
                            let uptime = el['VALUE'][0].match(/[\d]+/g).reduce((acc:number,val:number,ind:number)=>{let sec = [86400,3600,60]; return acc + (val * sec[ind]);}, 0)
                            let nodeName = el['$']['NAME'].replace(' Uptime', '')
                            sps[nodeName] = { uptime:0 }
                            sps[nodeName].uptime = uptime
                        });

                        let currentTime = Math.floor(new Date().getTime() / 1000)

                        result[command] = Object.keys(sps).map((key:string) => {
                            let nNode = { 
                                node: key, 
                                time: currentTime, /*sps[key]['time']*/
                                uptime: sps[key]['uptime'] 
                            }
                            return nNode;
                        })
                        break;
                    } //case uptime
                        
                    

                } //switch

            } //for commands

        }
        catch (error) {
            
            console.log(thisClass.server, "Error: ", error)
        }

        return result;
    } //request

} //class
