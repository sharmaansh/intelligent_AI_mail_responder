var AWS = require('aws-sdk');
var MailParser = require("mailparser").MailParser;                  // to parse the mail from MIME format
var parser = new MailParser();
var s3 = new AWS.S3();                                              // for reading mail from s3 bucket
const https = require('https');                                     // to send post request to our mail server to send mail
var dynamodb=new AWS.DynamoDB();                                    // to store and read data from dynmodb noSQL database
var comprehend=new AWS.Comprehend();                                // to detect the language of user 
var translate = new AWS.Translate();                                // to translate the content to different languages
let dbClient = new AWS.DynamoDB.DocumentClient();                    // to read data from dynmodb
 var body,ulang,uid,email;
    
        exports.handler = (event, context, callback) => {  
            s3.getObject({Bucket: "treply",Key:event.Records[0].s3.object.key},function(err,data){
                if(!err)
                {
                    parser.on('headers', headers => {
                        uid=headers.get('subject');
                        
                    //console.log(sub);
                    });
                    
                    parser.on('data', data => {
                    if (data.type === 'text') {
                        body=data.text;
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
                    
                    /** removing Re from subject of mail to get the token **/
                    uid=uid.replace("Re:"," ");
                    uid=uid.trim();
                    console.log("uid: "+uid);
                    var params = {TableName: "UserInfo",
                    Key: {"uid": uid}
                    };
                    dbClient.get(params,function(err,dat){
                    if(!err && dat.Item)
                    {
                        console.log(dat);
                        email=dat.Item.email;
                        ulang=dat.Item.ulang;
                        console.log("email "+email);
                        console.log("ulang "+ulang);
                        
                        console.log("body: "+body);
                        var sub="Solution to your query";
                        langcall(sub,solution);
                    }
                    else
                    {
                        console.log(err);
                    }
                });
                      }
                    });
                    
                    /** writing stream of mail in MIME format **/
                    parser.write(data.Body.toString());
                    parser.end();
                }
                else
                {
                    console.log("unable to read data from s3 "+err);
                }
            });
        
           
        };
        
        
        
       
        
        /**  function to store the data to dynmodb   ***/
        function dbwrite(email,sub,body,ulang,csub,cbody)
        {
            
            //var uid=uid_gen(email);
            var params={ TableName: "UserInfo",
            Item: {"uid": {S: uid},
                "email": {S: email},
                "sub": {S:sub},
                "body": {S: body},
                "ulang": {S: ulang},
                "csub": {S: csub},
                "cbody":{S: cbody}
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
        
        
      
        
        
       
        /** function to send post data to server to send the mail **/
        function sendmail(email,sub,body)
        {
            console.log("email is "+email);
           
            var data='too='+email+'&subb='+sub+'&bodyy='+body+"<br>";
            console.log("post data: "+data);
            const options = {
            hostname: 'asdf.com',
            port: 443,
            path: '/asdfg.php',
            method: 'POST',
             headers: {
             'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(data, 'utf8')
                }
            };
            console.log("size: "+Buffer.byteLength(data, 'utf8'));
            
            const req = https.request(options, (res) => {                   // sending post request
            console.log(`statusCode: ${res.statusCode}`);
            console.log(`statusCode: ${JSON.stringify(res.headers)}`);
            res.setEncoding('utf8');

            res.on('data', (d) => {
            console.log("response: "+d);
            });
  
            req.on('end', (error) => {
            console.error("error: "+error);
            });


            req.on('error', (error) => {
            console.error("error: "+error);
            });
            });
            req.write(data);
            req.end();
        }
       
       
       
       /** function to send email by converting to user language **/
       function langcall(sub,body)
        {
               var tsub,tbody;
                if(ulang=="en")
                {
                   sendmail(email,sub,body);                                    // sending mail to user in english language
                   console.log("replied in english as same language");
                }
                else
                {  
                    var params = {
                    SourceLanguageCode: 'en',
                    TargetLanguageCode: ulang, 
                    Text: sub};
                    translate.translateText(params, function(err, data) {
                    if (err) console.log(err, err.stack); // an error occurred
                    else
                    {
                        tsub=data.TranslatedText;
                        console.log("csub: "+data.TranslatedText);
                        var params = {
                        SourceLanguageCode: 'en',
                        TargetLanguageCode: ulang, 
                        Text: body};
                        translate.translateText(params, function(err, data) {
                        if (err) console.log(err, err.stack); // an error occurred
                        else
                            {
                                tbody=data.TranslatedText;
                                console.log("cbody: "+data.TranslatedText);
                                sendmail(email,tsub,tbody);                     //sending mail after translating to user language
                                console.log("data sent agter translation");
                                
                            }
                        });    
                    }
                });
                }
        }
        
