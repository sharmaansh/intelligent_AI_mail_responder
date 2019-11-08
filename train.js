var AWS = require('aws-sdk');
var MailParser = require("mailparser").MailParser;               // to parse the mail from MIME format
var parser = new MailParser();
var s3 = new AWS.S3();                                           // for reading mail from s3 bucket
const MonkeyLearn = require('monkeylearn');                       // to call the classifier model to train the model  
var dynamodb=new AWS.DynamoDB();                                // to store and read data from dynmodb noSQL database
let dbClient = new AWS.DynamoDB.DocumentClient();               // to read data from dynmodb
 var body,sub,uid;
    
        exports.handler = (event, context, callback) => {  
            
            var key=event.Records[0].s3.object.key;
            s3.getObject({Bucket: "treply",Key:key},function(err,data){
                if(!err)
                {
                    /** reading header of mail i.e. subject **/
                    parser.on('headers', headers => {
                        uid=headers.get('subject');
                    });
                    
                    /** to parse the body of the mail **/
                    parser.on('data', data => {
                    if (data.type === 'text') {
                        body=data.text;
                        
                    /** to remove the RE: from the subject to get the token**/    
                    uid=uid.replace("Re:"," ");
                    uid=uid.trim();
                    console.log("uid: "+uid);
                    var params = {TableName: "UserInfo",
                    Key: {"uid": uid}
                    };
                    dbClient.get(params,function(err,dat){          // to read data from dynmodb
                    if(!err)
                    {
                        var csub=dat.Item.csub;                     // user problem subject in english language
                        var cbody=dat.Item.cbody;                   // user problem body in english language
                        
                        var ptype,info,solution;
                        /** index of problem code block **/
                        var i=body.indexOf("{");
                        var j=body.indexOf("}");
                        if(j-i>1)
                        {
                            var k=body.indexOf(":",i);
                            /** getting problem code **/
                            if(k!=-1)
                                ptype=body.slice(i+1,k);
                            else
                                k=i;
                            /** getting about problem code if exits **/
                            info=body.slice(k+1,j);
                        }
                        /** index of solution block **/
                        j=body.indexOf("{",j);
                        i=body.indexOf("}",j);
                        solution=body.slice(j+1,i);
                        
                        console.log("Pcode: "+ptype);
                        console.log("Info: "+info);
                        console.log("Solution: "+solution);
                       
                        if(ptype!=null)
                        {
                            ptype=ptype.trim();
                            ptype=ptype.toUpperCase(); 
                        var params = {TableName: "assign",
                        Key: {"type": ptype}
                        };
                        dbClient.get(params,function(err,data){                 //reading data from dynmodb
                            /** if flag is present then send the problem statement for training */
                            if(!err && data.Item)
                            {
                                console.log("data found: "+data.Item.name);
                                upload_data(ptype,csub+" "+cbody);
                            }
                            else if(!err)
                            {
                                /** if tag is new then add tag to ML model and send the problem statement for training **/
                                if(info)
                                {
                                    sub="Solution for your Issue";              
                                    tagupdate(ptype,info);
                                    addsol(ptype,sub,solution);
                                    addtag(ptype,csub+" "+cbody);
                                }
                            }
                            else
                            {
                                console.log("data not found "+err);
                            }
                        
                        });
                        }
                        
                    }
                    else
                    {
                        console.log(err);
                    }
                });
                      }
                    });
                    parser.write(data.Body.toString());
                    parser.end();
                }
                else
                {
                    console.log("unable to read data from s3");
                }
            });
        };
        
        
        
       
        
        /**  function to store the tag and taginfo to dynmodb   ***/
        function tagupdate(tag,info)
        {
            //var uid=uid_gen(email);
            var params={ TableName: "assign",
            Item: {"type": {S: tag},
                "name": {S: info},
                "amail": {S: "mail@gmail.com"}
            }};
            
             dynamodb.putItem(params,function(err,data){
                 if(!err)
                 {
                    console.log("dynodb write success");
                 }
                 else
                 {
                     console.log("dynodb write failed");
                 }
             });
        }
        
        
        /** function to add solution to database **/
        function addsol(tag,sub,body)
        {
            //var uid=uid_gen(email);
            var params={ TableName: "solution",
            Item: {"irname": {S: tag},
                "body": {S: body},
                "sub": {S: sub}
            }};
            
             dynamodb.putItem(params,function(err,data){
                 if(!err)
                 {
                    console.log("dynodb write success");
                 }
                 else
                 {
                     console.log("dynodb write failed");
                 }
             });
        }
      
        
        

    /** function to add tag in ML model **/
    function addtag(tag,text)
    {
        const ml = new MonkeyLearn('1534fc2f8f4dd41ee1af8e9bd69c0e9a50dba597');
        let model_id = 'cl_pCXF9YoP';
        let data = {"name":tag};
        ml.classifiers.tags.create(model_id, data).then(res => {
            console.log(res.body);
            upload_data(tag,text);
        })
    }
    
    
    
    /** function to add data to ML model for training**/
    function upload_data(tag,text)
    {
        const ml = new MonkeyLearn('1534fc2f8f4dd41ee1af8e9bd69c0e9a50dba597');
        let model_id = 'cl_pCXF9YoP';
        let data = [{text:text,tags:[tag]}];
        ml.classifiers.upload_data(model_id, data).then(res => {
            console.log(res.body);
        })
    }
