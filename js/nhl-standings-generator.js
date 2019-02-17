var dataSources = { 
"201819": "./data/results_2018-10-01_2019-07-01.json",
"201718": "./data/results_2017-10-01_2018-07-01.json",
"201617": "./data/results_2016-10-01_2017-07-01.json",
"201516": "./data/results_2015-10-01_2016-07-01.json"
};

var dataSrc;

var tabsInfo = new Object();

$(document).ready( function() {
  var url = new URI( location );
  
  $('#tabs > ul > li').each( function( i, el ) { tabsInfo[ activeTabName( $(el) )] = i; } );
  
  updateDataSource();
  var activeTab = 0;
  if ( url.query() ) { 
    var query = url.query( true );
    $('form#diy').deserialize( url.query() );
    if ( query.tab ) {
      activeTab = tabsInfo[query.tab];
    }
  }
  $( "#tabs" ).tabs({ active: activeTab });
  $('form#diy').on( "submit", function( e ) {
    e.preventDefault();
    updateDataSource();
    if ( $('#tabs').tabs("option", "active") == 3 ) { 
      playoffs();
    }
    if ( $('#tabs').tabs("option", "active") == 4 ) { 
      playoffs( $('#playoffs-group').val());
    }
    else {
      calculate();
    }
    url.query( $( this ).serialize() + '&tab=' + activeTabName() );
    history.pushState('', '', '?' + url.query());
  }).submit();
  $('form#diy').on('reset', function(e){
      history.pushState('', '', '?');
  });
  
  $( "#tabs" ).on( "tabsactivate", function( event, ui ) {
    url.setQuery('tab', activeTabName(ui.newTab) );
    history.pushState('', '', '?' + url.query());
    if (activeTabName(ui.newTab) == 'wildcard' ) { 
      playoffs();
    }
    else if (activeTabName(ui.newTab) == 'playoffs' ) { 
      playoffs( $('#playoffs-group').val());
    }
    else {
      calculate();
    }
  } );
  
  $('#dataSrc').change( function() { updateDataSource(); } );

});

function activeTabName( tab ) {
  if ( !tab ) {
    tab = $('#tabs').find("li[role=tab]").eq( $('#tabs').tabs('option', 'active') );
  }
  return tab.text().toLowerCase().replace(/\s+/g, '');
}

function updateDataSource( ) {
  dataSrc = dataSources[ $('#dataSrc').val() ];
  fetchData( function(data) { $('#dataLastUpdated').html( data.lastModified) } );
}

function fetchData( callback ) {
  $.ajax({
    url: dataSrc,
    dataType: 'json',
    headers: { 'Cache-Control': 'max-age=600, public' },
    success: function (response) {
        callback(response);
    },
  });
}

var displayFields = [ 'name', 'GP', 'wins', 'winsRG', 'winsOT', 'winsSO', 'losses', 'lossesRG', 'lossesOT', 'lossesSO', 'goalsRG', 'goalsOT', 'goalsNHL', /*'goalsAgainstRG', 'goalsAgainstOT', 'goalsAgainstNHL',*/ 'NHLPoints', 'CustomPoints'];

function calculate( ) {
  $('#standings').empty();
  var division = 'division';
  var conference = 'conference';
  fetchData( function(data) { 
    var output = "";
    output += "<thead><tr><th>" + displayFields.join("</th><th>") + "</th></tr></thead>";

    $.each( data.results, function( index, team) {
        switch ( activeTabName() ) {
          case "conference": 
            if ( conference != team.conference) {
                conference = team.conference;
                output += "</tbody><tbody class=\"tablesorter-no-sort\"><tr class=\"conference\"><th colspan=\"" + displayFields.length + "\">" + conference + "</th></tr></tbody><tbody>";
            }                       
          break;
          case "division":
            if ( division != team.division) {
                division = team.division;
                output += "</tbody><tbody class=\"tablesorter-no-sort\"><tr class=\"division\"><th colspan=\"" + displayFields.length + "\">" + division + "</th></tr></tbody><tbody>";
            }           
          break;
          default:
        }
        team['NHLPoints'] = calculateNHLPoints(team);
        team['CustomPoints'] = calculateCustomPoints(team);
        
        var cells = displayFields.map( function(key) { return team[key]; });
        output += "<tr><td>" + cells.join("</td><td>") + "</td></tr>";
    } );
    $('#standings').html(output);
    $('#standings').tablesorter({ 
            sortInitialOrder: 'desc',
            widgets : ['zebra','columns'],
            sortList: [[displayFields.length - 1,1]]
        });
    $("#standings").trigger("updateAll"); 
    $('#standings').trigger('applyWidgets');
  } );
}

function playoffs( type = "wildcard", leaders = 3 ) {

  if ( 'fiegi' == type) { playoffs_fiegi(); return; }
  
  $('#playoffs').empty();
  var teamsByDivision = new Object();
  var teamsByConference = new Object();
  var teamsAll = new Array();
  var wildcardSlots = 2;
  
  fetchData( function(data) { 
    var output = "";
    
    //Reformatting by Conference and Division
    $.each( data.results, function( index, team) { 
      if ( !teamsByDivision[team.conference] ) {
        teamsByDivision[team.conference] = new Object();
      }
      if ( !teamsByDivision[team.conference][team.division] ) {
        teamsByDivision[team.conference][team.division] = [];
      }
      if ( !teamsByConference[team.conference] ) {
        teamsByConference[team.conference] = [];
      }
      
      team['winsROW'] = team['winsRG'] + team['winsOT'];
      team['goalDiff'] = team['goals'] - team['goalsAgainst'];
      team['NHLPoints'] = calculateNHLPoints(team);
      team['CustomPoints'] = calculateCustomPoints(team);
      teamsByDivision[team.conference][team.division].push( team );
      teamsByConference[team.conference].push( team );
      teamsAll.push( team );
    });
    
    var playoffs = new Object();
    
    switch ( type ) { 
      case 'wildcard':
        $.each( teamsByDivision, function( conference, divisions) { 
          playoffs[conference] = new Object();
          playoffs[conference]["playoffs"] = new Object();
          playoffs[conference]["nonplayoffs"] = [];
          var wildcard = [];
          $.each( divisions, function( division, teams ) {
            teams = teams.sort( sortByCustomPoints );
            playoffs[conference]["playoffs"][division] = teams.slice(0, leaders); //Top 3 of each division
            wildcard = wildcard.concat( teams.slice(leaders) ); //Store everyone else in here temporarily
          } );
          wildcard = wildcard.sort( sortByCustomPoints );
          playoffs[conference]["playoffs"]["Wild Card"] = wildcard.slice(0, wildcardSlots);
          playoffs[conference]["nonplayoffs"] = wildcard.slice(wildcardSlots);
        } );
      break;
    
      case 'conference': 
        leaders = 8;
        $.each( teamsByConference, function( conference, teams) { 
          teams = teams.sort( sortByCustomPoints );
          playoffs[conference] = new Object();
          playoffs[conference]["playoffs"] = teams.slice(0, leaders);
          playoffs[conference]["nonplayoffs"] = teams.slice(leaders);
        } );     
      break;
      
      case 'league':
        leaders = 16;
        teams = teamsAll.sort( sortByCustomPoints );
        playoffs = new Object();
        playoffs["playoffs"] = teams.slice(0, leaders);
        playoffs["nonplayoffs"] = teams.slice(leaders);     
      break;

      case 'division':
      
      break;
    }

    output = "<thead><tr><th>" + displayFields.join("</th><th>") + "</th></tr></thead>";
    
    if ( 'league' === type ) {
      output += printPlayoffsTable( playoffs );
    }
    else { 
      $.each( playoffs, function( conference, positions ) {
        output += "<tbody class=\"tablesorter-no-sort\"><tr class=\"conference\"><th colspan=17>" + conference + "</th></tr></tbody>";
        output += printPlayoffsTable( positions );
      });
    }
    
    if ( activeTabName() == 'wildcard') { 
      $('#wildcard').html(output); 
      return;
    }
    
    $('#playoffs').html(output);
    
    var output = "<h2>Playoff Matchups</h2>";
    output += "<div class=\"playoffs-matchups\">"; 
    switch ( type ) {
      case 'wildcard': 
        $.each( teamsByDivision, function( conference, divisions ) {
          output += "<div class=\"playoffs-conference\">";
          output += "<h3>" + conference + "</h3>";
          var conferenceTeams = teamsByConference[conference];
          conferenceTeams = conferenceTeams.sort( sortByCustomPoints );
          var conferenceLeader = conferenceTeams[0];
          $.each( divisions, function( division, teams ) { 
            output += "<h4>" + division + "</h4>";
            if ( division == conferenceLeader.division ) { 
              output += "<p><span class=\"team-name\">" + conferenceLeader.name + '</span> vs <span class=\"team-name\">' + playoffs[conference]['playoffs']['Wild Card'][1].name + " (WC2)</span></p>";
            }
            else {
              output += "<p><span class=\"team-name\">" + playoffs[conference]['playoffs'][division][0].name + '</span> vs <span class=\"team-name\">' + playoffs[conference]['playoffs']['Wild Card'][0].name + " (WC1)</span></p>";
            }
            output += "<p><span class=\"team-name\">" + playoffs[conference]['playoffs'][division][1].name + '</span> vs <span class=\"team-name\">' + playoffs[conference]['playoffs'][division][2].name + "</span></p>";
          });
          output += "</div>";
        } );
      break;
      case 'conference': 
        $.each( teamsByConference, function( conference, teams ) {
          output += "<div class=\"playoffs-conference\">";
          output += "<h3>" + conference + "</h3>";
          teams = teams.sort( sortByCustomPoints );
          var index = 0;
          var lastIndex = leaders -1;
          while ( index < lastIndex ) {
            output += "<p><span class=\"team-name\">" + teams[index].name + '</span> vs <span class=\"team-name\">' + teams[lastIndex].name + "</span></p>";
            index++;
            lastIndex--;
          }
          output += "</div>";
        });
      break;
      case 'league': 
        teams = teamsAll.sort( sortByCustomPoints );
        var index = 0;
        var lastIndex = leaders -1;
        while ( index < lastIndex ) {
          output += "<p><span class=\"team-name\">" + teams[index].name + '</span> vs <span class=\"team-name\">' + teams[lastIndex].name + "</span></p>";
          index++;
          lastIndex--;
        }
      break;
    }
    output += "</div>";

    $('#playoffs-bracket').html(output);
    
  } );  
  
}

function playoffs_fiegi( ) {
  var playoffs, teams;
  $('#playoffs-bracket').empty();
  $('#playoffs').empty();
  teams = new Array();
  
  fetchData( function(data) { 
    var output = "";
    
    $.each( data.results, function( index, team) {       
      team['winsROW'] = team['winsRG'] + team['winsOT'];
      team['goalDiff'] = team['goals'] - team['goalsAgainst'];
      team['NHLPoints'] = calculateNHLPoints(team);
      team['CustomPoints'] = calculateCustomPoints(team);
      teams.push( team );
    });
    
    teams = teams.sort( sortByCustomPoints );
    
    playoffs = new Object();
    playoffs["qualifying"] = teams.slice(-16);
    playoffs["round0"] = teams.slice(8, 16);    
    
    $.get( {
    url: './fiegi_template.html',
    dataType: 'text',
    success: function(response) {
      var $fiegi = $(response);
      var i = 0;
      for (i; i < teams.length; i++ ) {
        $('li .fiegi-seed-' + (i+1), $fiegi).find('.fiegi-team-name').empty().data('seed', i).append(teams[i].name + ' (' + (i+1) + ')' ).addClass('primary-bg--team-' + teams[i].id);
      }
      $('p .fiegi-seed-17', $fiegi).text(teams[16].name + ' (' + 17 + ')' );
      
      $('.fiegi-qualifying-round', $fiegi).on( 'fiegi:refresh', function() { 
        fiegi_complete_round( this, 7, '.fiegi-qualifying-seed-', teams) 
      });

      $('.fiegi-wild-card-round', $fiegi).on( 'fiegi:refresh', function() { 
        fiegi_complete_round( this, 8, '.fiegi-wild-card-seed-', teams);
      });

      $('.fiegi-round-1', $fiegi).on( 'fiegi:refresh', function() { 
        fiegi_complete_round( this, 8, '.fiegi-round1-seed-', teams); 
      });

      $('.fiegi-round-2', $fiegi).on( 'fiegi:refresh', function() { 
        fiegi_complete_round( this, 4, '.fiegi-round2-seed-', teams); 
      }); 

      $('.fiegi-round-3', $fiegi).on( 'fiegi:refresh', function() { 
        fiegi_complete_round( this, 2, '.fiegi-round3-seed-', teams);
      });

      $('.fiegi-round li > span', $fiegi).on('click', '.fiegi-team-name', function() { 
        fiegi_team_select( this, teams );
      });
      
      $('#playoffs-bracket').append($fiegi);
    },
  });
    
  });
}

function fiegi_team_select( el, teams ) {
  $(el).parents('li').find('.fiegi-team-name').removeClass('selected');
  $(el).addClass('selected');
  $(el).parents('.fiegi-round').trigger('fiegi:refresh');
}

function fiegi_complete_round( parentRound, seriesNum, targetClass, teams ) {
  var $selectedTeams = $( '.fiegi-team-name.selected', $(parentRound) );
  $selectedTeams.sort( function( a, b ) {
    a = parseInt( $(a).data('seed') );
    b = parseInt( $(b).data('seed') );
    return a - b;
  });
  if ( $selectedTeams.length == seriesNum ) {
    $selectedTeams.each( function( i, el) { 
      var $target = $( targetClass + (i+1), $(parentRound).parents('.fiegi-playoffs')).find('.fiegi-team-name');
      if ( $selectedTeams.eq(i).data('seed') != $target.data('seed') ) {
        $target.replaceWith( $(this).clone(true).off().removeClass('selected') );        
      }
    });
  }
  else {
    for ( var i = 0; i < seriesNum; i++ ) { 
      var $target = $( targetClass + (i+1), $(parentRound).parents('.fiegi-playoffs')).find('.fiegi-team-name:not(:empty)');
      $target.empty().removeData().attr('class', 'fiegi-team-name');        
    }
  }
  $(parentRound).next('.fiegi-round').trigger('fiegi:refresh');
}

function printPlayoffsTable( positions ) {
  var output = '';
  if ( Array.isArray( positions.playoffs ) ) { 
    output += printTableRows( positions.playoffs );
  }
  else {
    $.each( positions.playoffs, function( label, teams ) {
        output += "<tbody class=\"tablesorter-no-sort\"><tr class=\"division\"><th colspan=17>" + label + "</th></tr></tbody>";
        output += "<tbody>";
        output += printTableRows( teams );
        output += "</tbody>";
    } );
  }
  output += "<tbody class=\"non-playoff-teams\">";
  output += printTableRows( positions.nonplayoffs );
  output += "</tbody>";
  return output;
}

function printTableRows( teams ) {
  output = "";
  var even = true;
  $.each( teams, function( index, value ) {
      var cells = displayFields.map( function(key) { return value[key]; });
      output += "<tr class=\"" + ( ( even ) ? "odd" : "even" ) +"\"><td>" + cells.join("</td><td>") + "</td></tr>";
      even = !even;
  } );
  return output;
}

function sortByCustomPoints( a, b ) {
  var tieBreakers = ['CustomPoints', 'GP', 'winsROW', 'goalDiff'];
  return sortByPoints( a, b, tieBreakers);
}

function sortByNHLPoints( a, b ) {
  var tieBreakers = ['NHLPoints', 'GP', 'winsROW', 'goalDiff'];
  return sortByPoints( a, b, tieBreakers);
}

function sortByPoints( a, b, tieBreakers ) {
  for ( var i = 0; i < tieBreakers.length; i++ ) {
    var compare = ( tieBreakers[i] === 'GP' ) ? a[tieBreakers[i]] - b[tieBreakers[i]] : b[tieBreakers[i]] - a[tieBreakers[i]];
    if ( ( compare ) != 0 ) {
      return compare;
    }
  }
  return 0;
}

function calculateNHLPoints( teamRecord ) {
  return 2 * teamRecord.wins + teamRecord.lossesOT + teamRecord.lossesSO;
}

function calculateCustomPoints( teamRecord ) {
  //Doing some very basic data sanitization
  var fieldNames = [ 'winRG', 'winOT', 'winSO', 'lossRG', 'lossOT', 'lossSO' ];
  var fieldValues = new Object();
  fieldNames.forEach( function( field ) { 
    fieldValues[field] = Number( $('#' + field).val() );  
    if ( isNaN( fieldValues[field] ) ) { 
      fieldValues[field] = 0;
      $('#' + field).val( 0 )
    }
  } );
  
  var customPoints = 0;
  customPoints += fieldValues.winRG * teamRecord.winsRG;
  customPoints += fieldValues.winOT * teamRecord.winsOT;
  customPoints += fieldValues.winSO * teamRecord.winsSO;
  customPoints += fieldValues.lossRG * teamRecord.lossesRG;
  customPoints += fieldValues.lossOT * teamRecord.lossesOT;
  customPoints += fieldValues.lossSO * teamRecord.lossesSO;
  
  return customPoints;
}