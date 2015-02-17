var userProperties = PropertiesService.getUserProperties();

var internalStates = {
  bare: {
    previous: null,
    val: 0,
    text: 'bare',
    next: 'analysed'
  },
  analysed: {
    previous: null,
    val: 1,
    text: 'analysed',
    next: 'prepared'
  },
  prepared: {
    previous: 'bare',
    val: 2,
    text: 'prepared',
    next: 'copyInProgress'
  },
  copyInProgress: {
    previous: 'bare',
    val: 3,
    text: 'copyInProgress',
    next: 'finished'
  },
  finished: {
    previous: 'bare',
    val: 4,
    text: 'finished',
    next: null
  }
}

var frontendStates = {
  analyse: {
    val: 0,
    text: 'Analyse',
    next: 'analyseRunning',
    back: null,
    disabled: false
  },
  analyseRunning: {
    val: 1,
    text: 'Analysing...',
    next: 'prepare',
    back: 'analyse',
    disabled: true
  },
  prepare: {
    val: 2,
    text: 'Prepare',
    next: 'prepareRunning',
    back: 'analyseRunning',
    disabled: false
   },
  prepareRunning: {
    val: 3,
    text: 'Preparing...',
    next: 'copy',
    back: 'prepare',
    disabled: true
  },
  copy: {
    val: 4,
    text: 'Copy',
    next: 'copyRunning',
    back: 'prepareRunning',
    disabled: false
  },
  copyRunning: {
    val: 5,
    text: 'Copying...',
    next: 'finished',
    back: 'copy',
    disabled: true
  },
  finished: {
    val: 6,
    text: 'Finished',
    next: null,
    back: 'copyRunning',
    disabled: false
  }
}

/**
 * Init
 */
function init()
{
  try {
    initState_();
    var currentState = getFrontendState_();
    
    if (
      (currentState.val == internalStates.prepared.val || currentState.val == internalStates.copyInProgress.val || currentState.val == internalStates.finished.val)
      &&
      !healthCheck_()
      ) {
        reset();
      }
    
    setSourceDir_();
    
    return getCurrentStatus_('Everything is set to go...');
  } catch (e) {
    reset();
    throw getErrorMessage_(4);
  }
}

function healthCheck_()
{
  var destinationDir = getDestinationDir_();
  Logger.log('Destination dir: '+destinationDir)
  return !(destinationDir == null || destinationDir.isTrashed())
}

function getCurrentStatus_(message)
{
  return {
    'states': frontendStates,
    'analysis': getAnalysis_(),
    'currentState': getFrontendState_(),
    'message': message
  }
}

/**
 * State Machine
 */
function initState_()
{
  Logger.log(internalStates[getProperty_('currentState')]);
  if (getCurrentState_() == null) {
    setNewState_(internalStates.bare);
  }
}

function nextState_()
{
  var currentState = getCurrentState_();
  
  if (currentState.next != null) {
    setNewState_(internalStates[currentState.next]);
  }
}

function resetState_()
{
  initState_();
  var currentState = getCurrentState_();
}

function getCurrentState_()
{
  var currentState = getProperty_('currentState');
  if (currentState != null) {
    currentState = internalStates[getProperty_('currentState')];
  }
  
  return currentState;
}

function setNewState_(newState)
{
  setProperty_('currentState', newState.text);
}

function getFrontendState_()
{
  return mapInternalStateToFrontendStates_();
}

function mapInternalStateToFrontendStates_()
{
  var currentState = getCurrentState_();
  
  if (currentState.val == internalStates.bare.val) {
    return 'analyse';
  } else if (currentState.val == internalStates.analysed.val) {
    return 'prepare';
  } else if (currentState.val == internalStates.prepared.val || currentState.val == internalStates.copyInProgress.val) {
    return 'copy';
  } else {
    return 'finished';
  }
}

/**
 * Reset Everything
 */
function reset()
{
  try {
    var destinationDir = getDestinationDir_();
    
    if (destinationDir != null) {
      destinationDir.setTrashed(true);
    }
  } catch(e) {
    // NOTHING TO THROW HERE...
  }
  
  deleteAllProperties_();
  resetState_();
  setSourceDir_();
  
  return getCurrentStatus_('Reset done. You can now start from scratch...');
}

/**
 * Analyse
 */
function analyse()
{
  var analysis = analyseDir_(getSourceDir_());
  nextState_();
  setAnalysis_(analysis);
  
  return getSuccessMessage_(analysis, 'Analysis finished.');
}

function analyseDir_(sourceDir)
{
  var totalDirs = 0;
  var totalFiles = totalFilesInDir_(sourceDir);
  var dirs = sourceDir.getFolders();
  
  while(dirs.hasNext()) {
    var dir = dirs.next();
    var data = analyseDir_(dir);
    
    totalDirs++;
    totalFiles += data.totalFiles;
    totalDirs += data.totalDirs;
  }
  
  return {
    totalFiles: totalFiles,
    totalDirs: totalDirs
  }
}

function totalFilesInDir_(sourceDir)
{
  var files = sourceDir.getFiles();
  var totalFiles = 0;
  
  while(files.hasNext()) {
    totalFiles++;
    files.next();
  }
  return totalFiles;
}

function getAnalysis_()
{
  return {
    totalFiles: Math.round(getProperty_('totalFiles')),
    totalDirs: Math.round(getProperty_('totalDirs'))
  };
}

function setAnalysis_(analysis)
{
  setProperty_('totalFiles', analysis.totalFiles);
  setProperty_('totalDirs', analysis.totalDirs);
}

/**
 * Prepare destination dir
 */
function prepare()
{
  setSourceDir_();
  setDestinationDir_();
  nextState_();
  
  return getSuccessMessage_({}, 'Analysis finished.');
}

/**
 * Copy everything
 */

function copy()
{
  initFilesCopied_();
  
  if (folderIsNotFullyCopied_(getSourceDir_())) {
    try {
      copyAll_(getSourceDir_(), getDestinationDir_())
    } catch (e) {
      Logger.log("Ups!!! Something went wrong...");
      throw e;
    }
    
    Logger.log("Finally you backup is finished!");
    nextState_();
  }
  
  return getCurrentStatus_('Copy finished!!! YAY!!! :D');
}

function copyAll_(sourceDir, destinationDir)
{
  try {
    copyFiles_(sourceDir, destinationDir);
    copyFolders_(sourceDir, destinationDir);
  } catch (e) {
    throw (getErrorMessage_(2));
  }
  
  markFolderAsFullyCopied_(sourceDir);
}

function copyFiles_(sourceDir, destinationDir)
{
  var files = sourceDir.getFiles();
  
  while(files.hasNext()) {
    var file = files.next();
    
    if (fileIsNotCopied_(file)) {
      copySingleFile_(file, destinationDir);
      Utilities.sleep(2000);
    }
  }
}

function copySingleFile_(file, destinationDir)
{
  try {
    file.makeCopy(file.getName(), destinationDir);
  } catch(e) {
    Logger.log("Failed to copy '"+ file.getName() +"'. Error: '" + e.toString() + "'");
    throw e;
  }
  
  markFileAsCopied_(file);
}

function fileIsNotCopied_(file)
{
  return (getFile_(file.getId()) == null)
}

function markFileAsCopied_(file)
{
  try {
    incrementFilesCopied_();
    setFile_(file.getId(), true);
  } catch(e) {
    Logger.log("Error marking dir as visited. Error: " + e.toString());
    throw e;
  }
}

function copyFolders_(sourceDir, destinationDir)
{
  var folders = sourceDir.getFolders();
  
  while(folders.hasNext()) {
    var childSourceDir = folders.next();
    var childDestinationDir = null;
    
    if (folderIsNotFullyCopied_(childSourceDir)) {
      try {
        childDestinationDir = createDestinationFolder_(sourceDir, destinationDir, childSourceDir);
        incrementFilesCopied_();
      } catch(e) {
        Logger.log("Error duplicating folder '" + childSourceDir.getName() + "'. Error: " + e.toString());
        throw e;
      }
      
      try {
        copyAll_(childSourceDir, childDestinationDir);
      } catch (e) {
        Logger.log("Error copying folder '" + childSourceDir.getName() + "'" )
        throw e;
      }
    }
  }
}

function createDestinationFolder_(sourceDir, destinationDir, folderToCopy)
{
  var copiedFolderId = getMappedFolder_(folderToCopy.getId());
  
  if (copiedFolderId != null) {
    return DriveApp.getFolderById(copiedFolderId);
  } else {
    var copiedFolder = destinationDir.createFolder(folderToCopy.getName());
    setMappedFolder_(folderToCopy.getId(), copiedFolder.getId());
    return copiedFolder;
  }
}

function folderIsNotFullyCopied_(folder)
{
  return (getFolder_('fc_'+folder.getId()) == null);
}

function markFolderAsFullyCopied_(folder)
{
  try {
    setFolder_('fc_'+folder.getId(), true);
  } catch(e) {
    Logger.log("Error marking dir as visited. Error: " + e.toString());
    throw e;
  }
}

function getMappedFolder_(sourceFolderId)
{
  return getFolder_(sourceFolderId);
}

function setMappedFolder_(sourceFolderId, destinationFolderId)
{
  setFolder_(sourceFolderId, destinationFolderId);
}

/**
 * Count total files copied
 */
function getFilesCopiedKey_()
{
  return 'files_copied';
}

function initFilesCopied_()
{
  var filesCopied = getTotalFilesCopied_();
  
  if (filesCopied == null) {
    setProperty_(getFilesCopiedKey_(), 0);
  }
}

function incrementFilesCopied_()
{
  var filesCopied = getTotalFilesCopied_();
  
  if (filesCopied == null) {
    setProperty_(getFilesCopiedKey_(), 0);
  } else {
    setProperty_(getFilesCopiedKey_(), filesCopied+1);
  }
}

function getTotalFilesCopied_()
{
  return Math.round(getProperty_(getFilesCopiedKey_()));
}

/**
 * Utils
 */
function getSourceDirName_()
{
  return 'ponteiro-drive-migration-source';
}

function getDestinationDirName_()
{
  return 'ponteiro-drive-migration-destination';
}

function getSourceDir_()
{
  return DriveApp.getFolderById(getProperty_('source_dir_id'));
}

function setSourceDir_()
{
  var sourceDir = DriveApp.getFoldersByName(getSourceDirName_());
  if (sourceDir.hasNext()) {
    setProperty_('source_dir_id', sourceDir.next().getId());
  } else {
    throw (getErrorMessage_(0));
  }
}

function getDestinationDir_()
{
  var destinationDir = getProperty_('destination_dir_id');
  if (destinationDir != null) {
    destinationDir = DriveApp.getFolderById(getProperty_('destination_dir_id'));
  }
  
  return destinationDir;
}

function setDestinationDir_()
{
  var destinationDir = DriveApp.getRootFolder().createFolder(getDestinationDirName_());
  setProperty_('destination_dir_id', destinationDir.getId());
}

function getFolderPrefix_()
{
  return 'd_';
}

function getFolder_(key)
{
  return getProperty_(getFolderPrefix_()+key);
}

function setFolder_(key, value)
{
  setProperty_(getFolderPrefix_()+key, value);
}

function getFilePrefix_()
{
  return 'f_';
}

function getFile_(key)
{
  return getProperty_(getFilePrefix_()+key)
}

function setFile_(key, value)
{
  setProperty_(getFilePrefix_()+key, value)
}

/**
 * Property Operations
 */
function hasProperty_(key)
{
  return getProperty_(key) != null;
}

function getProperty_(key)
{
  return userProperties.getProperty(key);
}

function setProperty_(key, value)
{
  userProperties.setProperty(key, value);
}

function deleteProperty_(key)
{
  userProperties.deleteProperty(key);
}

function deleteAllProperties_()
{
  userProperties.deleteAllProperties();
}

/**
 * Error Messages
 */

var errorCodes = {
  0: "Source dir not found! Please create a folder with the name '" + getSourceDirName_() + "'",
  1: "Destination dir not found!",
  2: "Copy failed...",
  4: "Initialization failed, reset forced... Refresh the page to restart the process."
}

function getErrorMessage_(key)
{
  return '{"state": "' + getFrontendState_() + '","error":"' + errorCodes[key] + '"}';
}

/**
 * Success Messages
 */
function getSuccessMessage_(data, message)
{
  return {state: getFrontendState_(), data: data, message: message};
}

/**
 * Render UI
 */
function doGet()
{
  var template = HtmlService.createTemplateFromFile('index');
  template.sourceDirName = getSourceDirName_();
  return template.evaluate().setTitle('Google Drive Migration').setSandboxMode(HtmlService.SandboxMode.IFRAME);
}

function include(filename)
{
  return HtmlService.createHtmlOutputFromFile(filename).setSandboxMode(HtmlService.SandboxMode.IFRAME).getContent();
}
