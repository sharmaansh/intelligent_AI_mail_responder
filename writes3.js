var AWS = require('aws-sdk');
var MailParser = require("mailparser").MailParser;                  // to parse the mail from MIME format
var parser = new MailParser();
var s3 = new AWS.S3();                                              // for reading mail from s3 bucket
var dynamodb=new AWS.DynamoDB();                                    // to store and read data from dynmodb noSQL database
var comprehend=new AWS.Comprehend();                                // to detect the language of user 
var translate = new AWS.Translate();                                // to translate the content to different languages
 var body,sub,from;
    
        exports.handler = (event, context, callback) => {           // handler called when any event is occured
            s3.getObject({Bucket: "mailinput",Key:event.Records[0].s3.object.key},function(err,data){
                if(!err)
                {
                    /** parsing mail header **/
                    parser.on('headers', headers => {
                        sub=headers.get('subject');
                        var temp=headers.get('from');
                        from=temp.value[0].address;
                    //console.log(sub);
                    });
                    
                    /** parsing mail body **/
                    parser.on('data', data => {
                    if (data.type === 'text') {
                        body=data.text;
                    getlang(sub+"\n"+body);                   // calling function to detect language
                    
                      }
                    });
                    
                    /** input stream of mail to parser in MIME format **/
                    parser.write(data.Body.toString());
                    parser.end();
                }
                else
                {
                    console.log("Error:"+err);
                }
            });
        
           
        };
        
        
        /**  function to store the data to dynmodb   ***/
        function dbwrite(email,sub,body,ulang,csub,cbody)
        {
            
            var uid=uid_gen(email);
            var params={ TableName: "UserInfo",
            Item: {"uid": {S: uid},
                "email": {S: email},
                "sub": {S:sub},
                "body": {S: body},
                "ulang": {S: ulang},
                "csub": {S: csub},
                "cbody":{S: cbody}
            }};
            
             dynamodb.putItem(params,function(err,data){                        //saving data to dynmodb
                 if(!err)
                 {
                    console.log("dynodb write success");
                 }
                 else
                 {
                     console.log("dynodb write failed "+err);
                 }
             });
            
        }
        
        
        
        /** function to gen the token **/
        function uid_gen(email)
        {
            var num=Math.floor(Math.random()*100000);
            return email+num;
        }
        
        /** function for lang detection **/
        function getlang(content)
        {
            var params = {
            Text: content
            };
            comprehend.detectDominantLanguage(params, langcall);                // detecting language and call langcall function
        }
        
        
        
        /** function to convert user language to english and save it to table **/
        function langcall(err,data)
        {
            if(!err)
            {
                var ulang=data.Languages[0].LanguageCode;
                console.log(ulang);  // language code print
                if(ulang=="en")                                                 // if user language is english
                {
                   dbwrite(from,sub,body,ulang,sub,body);                       // saving problem statement to database
                   console.log("data saved to dynamodb as same langugage");
                }
                else                                                            // if user language is other than english
                {   var csub,cbody;
                    var params = {
                    SourceLanguageCode: ulang,
                    TargetLanguageCode: 'en', 
                    Text: sub};
                    translate.translateText(params, function(err, data) {           // translating subject of mail to english language
                    if (err) console.log(err, err.stack); // an error occurred
                    else
                    {
                        csub=data.TranslatedText;
                        console.log("csub: "+data.TranslatedText);
                        var params = {
                        SourceLanguageCode: ulang,
                        TargetLanguageCode: 'en', 
                        Text: body};
                        translate.translateText(params, function(err, data) {       // translating body of mail to english language
                        if (err) console.log(err, err.stack); // an error occurred
                        else
                            {
                                cbody=data.TranslatedText;
                                console.log("cbody: "+data.TranslatedText);
                                dbwrite(from,sub,body,ulang,csub,cbody);                // store the translated problem statement
                                console.log("data saved to dynamodb after translation");
                                
                            }
                        });    
                    }
                });
                }
            }
            else
            {
                console.log(err);
            }
        }
       
        
        
        