Attribute VB_Name = "modHttp"
'==============================================================================
' modHttp - Requisicoes HTTP (macOS via curl; Windows via WinHTTP)
'==============================================================================
' HTTP nativo para Excel Mac/Windows sem Python.
'
' Solucao macOS: MacScript() executa AppleScript embutido que roda `curl`.
' Tudo fica dentro do .xlsm (o AppleScript e uma string no VBA, sem arquivo
' externo). Na primeira execucao o macOS pode pedir permissao -> Permitir.
'
' Solucao Windows: WinHTTP (MSXML2.ServerXMLHTTP como fallback).

Option Explicit

' *** MAIN: HTTP GET, retorna corpo bruto (texto/JSON) ***
Public Function HttpGet(url As String) As String
    #If Mac Then
        HttpGet = HttpGetMac(url)
    #Else
        HttpGet = HttpGetWindows(url)
    #End If
End Function

#If Mac Then

' *** macOS: usa MacScript + curl ***
Private Function HttpGetMac(url As String) As String
    Dim script As String
    Dim result As String
    Dim safeUrl As String

    On Error GoTo ErrorHandler

    ' Escapar aspas duplas da URL para o contexto AppleScript
    safeUrl = Replace(url, """", "\""")

    ' AppleScript: do shell script "curl ..."
    ' -s: silencioso | -L: segue redirects | -m 30: timeout 30s
    ' As aspas simples ao redor da URL no shell evitam problemas com & e ?
    script = "do shell script ""curl -s -L -m 30 '" & safeUrl & "'"""

    result = MacScript(script)

    HttpGetMac = result
    Exit Function

ErrorHandler:
    Debug.Print "HttpGetMac erro (" & url & "): " & Err.Description
    HttpGetMac = ""
End Function

#Else

' *** Windows: usa WinHTTP / MSXML2 ***
Private Function HttpGetWindows(url As String) As String
    Dim http As Object
    Dim result As String

    On Error GoTo ErrorHandler

    On Error Resume Next
    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
    If http Is Nothing Then Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    On Error GoTo ErrorHandler

    If http Is Nothing Then
        HttpGetWindows = ""
        Exit Function
    End If

    http.Open "GET", url, False
    http.Send
    result = http.responseText

    HttpGetWindows = result
    Exit Function

ErrorHandler:
    Debug.Print "HttpGetWindows erro (" & url & "): " & Err.Description
    HttpGetWindows = ""
End Function

#End If

' *** Compat: nada de scratch sheet nesta abordagem (mantido p/ modMain) ***
Public Sub RemoveScratchSheet()
    ' No-op: a abordagem atual (curl/WinHTTP) nao usa aba de scratch.
    ' Mantido para compatibilidade com chamadas existentes em modMain.
End Sub

' *** TESTE: rodar isolado no VBE para validar HTTP antes do fluxo completo ***
Public Sub TesteHttp()
    Dim resp As String
    resp = HttpGet("https://economia.awesomeapi.com.br/json/last/USD-BRL")
    If Len(resp) = 0 Then
        MsgBox "FALHOU: resposta vazia. HTTP nao funcionou.", vbCritical
    Else
        MsgBox "OK! Primeiros 300 chars:" & vbCrLf & vbCrLf & Left(resp, 300), vbInformation
    End If
End Sub
