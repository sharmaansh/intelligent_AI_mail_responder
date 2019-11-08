const AWS = require('aws-sdk');
const https = require('https');                         // to send post request to our mail server to send mail 
const MonkeyLearn = require('monkeylearn')              // to call the classifier model to classify the problem statement
const dynamodb = new AWS.DynamoDB();                    // to store and read data from dynmodb noSQL database
var translate = new AWS.Translate();                    // to translate the text
let dbClient = new AWS.DynamoDB.DocumentClient();       // to read data from dynmodb

var uid,cbody,csub,email,ulang;
exports.handler = (event, context) => {
    event.Records.forEach((record) => {                 // reading the dynamodb content when triger
        uid=record.dynamodb.Keys.uid.S;
        cbody=record.dynamodb.NewImage.cbody.S;
        csub=record.dynamodb.NewImage.csub.S;
        email=record.dynamodb.NewImage.email.S;
        ulang=record.dynamodb.NewImage.ulang.S;
        
        //console.log('DynamoDB Record: %j',record.dynamodb );
    });
    
    /** to classify the problem using ML model on monkeylearn cloud services **/
    const ml = new MonkeyLearn('1534fc2f8f4dd41ee1af8e9bd69c0e9a50dba597');
    let model_id = 'cl_pCXF9YoP';
    let data = [csub+" "+cbody];
    ml.classifiers.classify(model_id, data).then(res => {
    var cat= res.body[0].classifications[0].tag_name;
    var conf=res.body[0].classifications[0].confidence;
    console.log("Tag:"+cat);
    console.log("Confidence:"+conf);
    
    /** if confidence is less then send the problem statement to expert group to reply  **/
    if(conf<0.4)
    {
        var params = {TableName: "assign",
        Key: {"type": cat}
        };
        console.log("progress 28");
        dbClient.get(params,function(err,data){
            console.log("entered in mail block");
            if(!err)
            {
                var amail=data.Item.amail;
                var name=data.Item.name;
                console.log("email "+email);
                console.log("name "+name);
                
                var tagdata="";
                var params = {
                TableName: "assign"
                };
                dynamodb.scan(params, function(err, data) {         // reading all tags to send to expert for classification
                if (err) console.log(err, err.stack); // an error occurred
                else
                    {
                    //console.log(data);           // successful response
                    for(var i=0;i<data.Count;i++)
                    {
                        tagdata+="{ "+data.Items[i].type.S+":"+data.Items[i].name.S+"}<br>";
                        console.log("tagdata: "+tagdata);
                    }
                     sendmail(amail,uid,"<b>Subject: </b>"+csub+"<br>"+cbody+"<br><br>"+tagdata);
                    }    
                });
                
                
               
                /** to notify user that their query is assigned to a resolving group **/
                var sub="In response to your query"
                var body="Your query is assigned to our "+name+" .Your problem will be solved within 24 hours. Our team will reply your soon";
                //langcall(sub,body);
                langcall(sub,body);
            }
            else
            {
                console.log(err);
            }
        });
    }
    else                // send the solution from knowledgebase 
    {
     var params = {TableName: "solution",
        Key: {"irname": cat}
        };
        console.log("progress 28");
        dbClient.get(params,function(err,data){
            console.log("entered in mail block");
            if(!err)
            {
                var sub=data.Item.sub;
                var body=data.Item.body;
                console.log("sub "+sub);
                console.log("Body "+body);
                langcall(sub,body);
            }
            else
            {
                console.log(err);
            }
        });
    }    
    });
};



/** funciton to reply the user according to his/her input language **/
 function langcall(sub,body)
        {
           
               var tsub,tbody;
                if(ulang=="en")
                {
                   sendmail(email,sub,body);                                // send mail if user language is english
                   console.log("replied in english as same language");
                }
                else
                {  
                    var params = {
                    SourceLanguageCode: 'en',
                    TargetLanguageCode: ulang, 
                    Text: sub};
                    translate.translateText(params, function(err, data) {       //converting sub to user language
                    if (err) console.log(err, err.stack); // an error occurred
                    else
                    {
                        tsub=data.TranslatedText;
                        console.log("csub: "+data.TranslatedText);
                        var params = {
                        SourceLanguageCode: 'en',
                        TargetLanguageCode: ulang, 
                        Text: body};
                        translate.translateText(params, function(err, data) {       // converting body to user language
                        if (err) console.log(err, err.stack); // an error occurred
                        else
                            {
                                tbody=data.TranslatedText;
                                console.log("cbody: "+data.TranslatedText);
                                sendmail(email,tsub,tbody);                     // sending the mail user in his/her language
                                console.log("data sent agter translation");
                                
                            }
                        });    
                    }
                });
                }
        }
        
        
        /** function to send mail by sending post request to our server **/
        function sendmail(email,sub,body)
        {
            console.log("email is "+email);
            var data='too='+email+'&subb='+sub+'&bodyy='+body;
            console.log("post data: "+data);
            const options = {
            hostname: 'udgamtrust.com',                     //domain where our mail server is running
            port: 443,
            path: '/test_ret.php',                          // script on server to send mail
            method: 'POST',
             headers: {
             'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(data, 'utf8')
                }
            };
            
            const req = https.request(options, (res) => {                   // sending post request to server
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
       
       
       
        
       
       
       
       