require('nodetime').profile({
    accountKey: '3c32e30466a3cb9ec8dad7c9771718704701eaa3',
    appName: 'ReadyGA Server'
});

// NWS Parsing Server
// Created: 2015.04.15
// Developer: Seth Davis

// ****************************************************************************************
// *** MODULES *******************************************************************************
// ****************************************************************************************

var express     = require('express');
var app         = express();
var server      = require('http').Server(app);
var io          = require('socket.io')(server);
var mongo       = require('mongodb');
var request     = require('request');
var ACS         = require('acs-node');
var es          = require('event-stream');
var parser      = require('weather-alerts-parser');
var through     = require('through');
var colors      = require('colors');

// ****************************************************************************************
// *** SETUP NWS ALERTS REFRESH ***********************************************************
// ****************************************************************************************

ACS.initACS('s5NpSPJo90ZOrBWkcO6pR4dIyVoEhHrX');

var alerts = {};
var db;
var socket;

function sendPush(zone, alert, data, callback){
    try{
        ACS.PushNotifications.notify({
            channel: zone,
            payload: '{"alert": "' + alert.title + '", ' + 
                     '"vibrate": "true", ' + 
                     '"sound": "default", ' + 
                     '"icon": "pushicon", ' + 
                     '"badge": "+1", ' + 
                     '"title": "' + alert.title + '", ' + 
                     '}',
            to_ids: 'everyone',
            session_id: data.meta.session_id
        }, function(e){
            if(e.success){
                try{
                    console.log('NOTIFICATION: '.red + zone.green  + ' - ' + alert.title.white);
                } catch(er){
                    console.log('NOTIFICATION: '.red + 'possible error'.white);
                }
            } else {
                var message = ((e.error && e.message) || JSON.stringify(e));

                console.log('NOTIFICATION: '.red + message.blue + ' for ' + zone);
            }
            callback();
        });
    } catch(er){
        console.log(er);
        callback();
    }

}

function getZones(alert, data, callback){
	var zones = [];
    var x = 0;
	
	function sendPushCallback(){
		x++;
		if(x < zones.length){
			sendPush(zones[x], alert, data, sendPushCallback);
		} else {
			alert.pushed = true;
			callback();
		}
	}

	if(!alert.pushed){
        if(alert.geocode){
            if(alert.parameter){
                if(alert.VTEC){
                    if(alert.parameter.VTEC.indexOf('.CON.') == -1){
                        zones = alert.geocode.UGC.split(' ');

                        sendPush(zones[x], alert, data, sendPushCallback);
                    } else {
                        console.log('INFO: Invalid alert type');
                        sendPushCallback();
                    }
                } else {
                    console.log('INFO: Invalid alert type');
                    sendPushCallback();
                }
            } else {
                console.log('INFO: Invalid alert type');
                sendPushCallback();
            }
        } else {
            console.log('INFO: Invalid alert type');
            sendPushCallback();
        }
    } else {
        console.log('INFO: Skipping... pushed already');
        callback();
    }
}

function nws(data){
    request.get('http://alerts.weather.gov/cap/ga.php?x=1')
        .on('error', function(err){
            console.log(err);
            setTimeout(function(){
                nws(data);
            }, 5000);
        })
        .pipe(parser.stream())
        .pipe(es.stringify())
        .pipe(through(function read(item) {
                var json = JSON.parse(item);
                var currentDate = new Date();
                if(!alerts.hasOwnProperty(json.title)){
                    json.pushed = false;
                } else {
                    json.pushed = alerts[json.title].pushed;
                }
                
                json.new = true;
            
                json.createdDate = currentDate.getFullYear() + '-' + (currentDate.getMonth() + 1) + '-' + currentDate.getDate();

                alerts[json.title] = json;
                this.queue(item);
            }, function end(){
                this.queue(null);
            }
        ))
        .on('close', function(){
            var count = 0;
            var keys = [];
            var x = 0;

            for(var key in alerts){
                count++;
                keys.push(key);
            }

            function getZonesCallback(){
                x++;
                if(x < count){
                    getZones(alerts[keys[x]], data, getZonesCallback);
                } else {
                    console.log('INFO: Push notifications complete.');

                    console.log('INFO: Cleaning up alerts...');
                    for(var key in alerts){
                        if(alerts[key].new === false || !alerts[key].hasOwnProperty('geocode')){
                            delete alerts[key];
                        } else {
                            alerts[key].new = false;
                        }
                    }
                    setTimeout(function(){
                        nws(data);
                    }, 5000);
                }
            }

            console.log('INFO: Alerts update complete.');
            console.log('INFO: Starting push notifications...');

            getZones(alerts[keys[x]], data, getZonesCallback);
        });
}



// function nws(data){
// 	request.get('http://alerts.weather.gov/cap/ga.php?x=1')
//     .on('error', function(err){
//         console.log(err);
//         setTimeout(function(){
//             nws(data);
//         }, 5000);
//     })
//     .pipe(parser.stream())
//     .pipe(es.stringify())
//     .pipe(through(function read(item) {
//             var json = JSON.parse(item);
// 			var currentDate = new Date();
//             if(!alerts.hasOwnProperty(json.title)){
//                 json.pushed = false;
//             } else {
//                 json.pushed = alerts[json.title].pushed;
//             }
            
//             json.new = true;
		
// 			json.createdDate = currentDate.getFullYear() + '-' + (currentDate.getMonth() + 1) + '-' + currentDate.getDate();

//             alerts[json.title] = json;
//             this.queue(item);
//         }, function end(){
//             this.queue(null);
//         }
//     ))
//     .on('end', function () {
//         var alertIds = [];
//         for(var key in alerts){
//             alertIds.push(key);
//         }
// 		db.collection('alerts').remove({});
//         asyncLoop(alertIds.length, function(alertLoop){
//             var key = alertIds[alertLoop.iteration()];
//             var notFound = false;

//             if(alerts[key]){
//                 if(alerts[key].pushed && alerts[key.parameter]){
//                     if(alerts[key].parameter.VTEC){
//                         if(alerts[key].pushed === false && alerts[key].parameter.VTEC.indexOf('.CON.') == -1){
//                             var areas = alerts[key].areaDesc.split(';');

//                             asyncLoop(areas.length, function(loop){
//                                 // try{
//                                 //     ACS.PushNotifications.notify({
//                                 //         channel: 'ios_push',
//                                 //         payload: '{"alert": "' + alerts[key].title + '", ' + 
//                                 //                  '"vibrate": "true", ' + 
//                                 //                  '"sound": "default", ' + 
//                                 //                  '"icon": "pushicon", ' + 
//                                 //                  '"badge": "+1", ' + 
//                                 //                  '"title": "' + alerts[key].title + '", ' + 
//                                 //                  '}',
//                                 //         to_ids: 'everyone',
//                                 //         session_id: data.meta.session_id
//                                 //     }, function(e){
//                                 //         if(e.success){
//                                 //             try{
//                                 //                 console.log('NOTIFICATION: '.red + areas[loop.iteration()].green  + ' - ' + alerts[key].title.white);
//                                 //             } catch(er){
//                                 //                 console.log('NOTIFICATION: '.red + 'possible error'.white);
//                                 //             }
//                                 //         } else {
//                                 //             console.log('Error:\n' + ((e.error && e.message) || JSON.stringify(e)));
//                                 //         }
//                                 //         loop.next();
//                                 //     });
//                                 // } catch(er){
//                                 //     console.log(er);
//                                 //     loop.next();
//                                 // }
//                                 console.log('NOTIFICATION: '.red + areas[loop.iteration()].green  + ' - ' + alerts[key].title.white);
//                                 loop.next();
//                             }, function(){
//                                 alerts[key].pushed = true;
//                                 db.collection('push').insert(alerts[key], function (err, result) {
//                                     if (err) {
//                                         console.log('ERROR: Collection item insert. ' + err);
//                                     } else {}
                                    
//                                     if(socket){
//                                         socket.emit('pushSent', {});
//                                         socket.broadcast.emit('pushSent', {});
//                                     }

//                                     alertLoop.next();
//                                 });
//                             });
//                         } else {
//                             alertLoop.next();
//                         }
//                     } else {
//                         notFound = true;
//                     }
//                 } else {
//                     notFound = true;
//                 }
//             } else {
//                 notFound = true;
//             }


//             if(notFound){
//                 alertLoop.next();
//             }

// 			db.collection('alerts').insert(alerts[key], function (err, result) {
//                 if (err) {
// 					console.log('ERROR: Collection item insert. ' + err);
// 				} else {
//                     // We are all good
//                 }
//             });


//         }, function(){
// 			for(var key in alerts){
// 				if(alerts[key].new === false){
// 					delete alerts[key];
// 				} else {
// 					alerts[key].new = false;
// 				}
// 			}

//             if(socket){
//                 socket.emit('alertsUpdate', alerts);
//                 socket.broadcast.emit('alertsUpdate', alerts);
//             }
//         });
// 	})
//     .on('close', function(){
// 		setTimeout(function(){
// 			nws(data);
// 		}, 5000);
// 	});
// }

// ****************************************************************************************
// *** API ENDPOINTS **********************************************************************
// ****************************************************************************************

app.get('/', function (req, res) {
    res.json(alerts);
});

// ****************************************************************************************
// *** START SERVER ***********************************************************************
// ****************************************************************************************

server.listen({port: 7999});

// ****************************************************************************************
// *** CREATE SOCKET.IO CONNECTION AND LOGIN TO ACS ***************************************
// ****************************************************************************************

io.on('connection', function (skt) {
    socket = skt;

    socket.on('getCurrentAlerts', function(){
        socket.emit('alertsUpdate', alerts);
    });
});

ACS.Users.login({login: 'push', password: 'user'}, function(data){
    if(data.success) {
        console.log("INFO: Successful to login to ACS.");
        mongo.connect('mongodb://localhost:27017/readyga', function (err, database) {
            if(err){
                console.log('ERROR: MongoDB Error: ' + JSON.stringify(err));
            } else {
                console.log("INFO: Successful MongoDB connection.");
                db = database;
                nws(data);
            }
        });
    } else {
        console.log("Error to login: " + data.message);
    }
});    

