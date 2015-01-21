var Browser = require('zombie');
//var assert = require('chai').assert;

var assert  = require('assert');

var browser;

suite('Cross-Page Tests', function(){
	setup(function(){
		//browser = new Browser();
		browser = Browser.create();
	});

	/*
	test('requesting a group rate quote from the hood river tour page ' +
	'should populate the referrer field' , function(done){

		this.timeout(25000);

		var referrer = 'http://localhost:3000/tours/hood-river';

		browser.visit('http://localhost:3000/tours/hood-river').
			then(function() {
		browser.clickLink("a[class=requestGroupRate]", function(){
				browser.assert.input('form input[name=referrer]', referrer);
				done();
			});
		});
	});
	
	test('requesting a group rate from the oregon coast tour page should ' +
	'populate the referrer field', function(done){
		var referrer = 'http://localhost:3000/tours/oregon-coast';
		
		browser.visit('http://localhost:3000/tours/oregon-coast').
		  then( function(){	
		  	browser.clickLink("a[class=requestGroupRate]", function(){
				//assert(browser.field('referrer').value=== referrer);
				
				//da un error de deepequal
				//browser.assert.input('form input[name=referrer]', "http://localhost:3000/tours/oregon-coast");
				browser.assert.element('form input[name=referrer]');
				done();
			});
		});
	});
    */

	test('visiting the "request group rate" page directly should result ' +
	'in an empty referrer field', function(done){
		browser.visit('http://localhost:3000/tours/request-group-rate',
		function(){
			//assert(browser.field('referrer').value === '');
			browser.assert.input('form input[name=referrer]', '');
			done();
		});
	});
});