Attribute VB_Name = "modJson"
'==============================================================================
' modJson - Extracao leve de valores JSON (VBA puro, sem dependencia externa)
'==============================================================================
' Nao e um parser JSON completo. Faz apenas o necessario para as 4 APIs:
' localizar uma chave e ler o valor (numerico ou string) associado a ela.
'
' Funcoes:
'  - JsonGetNumberByKey(json, key)          -> primeiro numero apos "key":
'  - JsonGetNumberByKeyAfter(json, anchor, key) -> numero de "key": buscando
'                                                  a partir de um ancora textual
'  - JsonGetStringByKey(json, key)          -> primeira string apos "key":

Option Explicit

' *** Numero associado a "key": (primeira ocorrencia) ***
Public Function JsonGetNumberByKey(json As String, key As String) As Variant
    JsonGetNumberByKey = JsonGetNumberByKeyAfter(json, "", key)
End Function

' *** Numero de "key": buscando a partir de um trecho ancora ***
Public Function JsonGetNumberByKeyAfter(json As String, anchor As String, key As String) As Variant
    Dim startPos As Long
    Dim keyPos As Long
    Dim colonPos As Long
    Dim i As Long
    Dim ch As String
    Dim numStr As String
    Dim started As Boolean

    On Error GoTo Fail

    startPos = 1
    If Len(anchor) > 0 Then
        startPos = InStr(1, json, anchor, vbTextCompare)
        If startPos = 0 Then GoTo Fail
    End If

    ' Procurar a chave entre aspas: "key"
    keyPos = InStr(startPos, json, """" & key & """", vbTextCompare)
    If keyPos = 0 Then GoTo Fail

    ' Achar os dois pontos apos a chave
    colonPos = InStr(keyPos + Len(key) + 2, json, ":")
    If colonPos = 0 Then GoTo Fail

    ' Varrer a partir do ':' coletando digitos/sinal/ponto/expoente
    numStr = ""
    started = False
    For i = colonPos + 1 To Len(json)
        ch = Mid(json, i, 1)
        If ch = " " Or ch = """" Or ch = vbTab Or ch = vbCr Or ch = vbLf Then
            If started Then Exit For
        ElseIf (ch >= "0" And ch <= "9") Or ch = "." Or ch = "-" Or ch = "+" Or ch = "e" Or ch = "E" Then
            numStr = numStr & ch
            started = True
        Else
            If started Then Exit For
        End If
    Next i

    If Len(numStr) = 0 Then GoTo Fail

    JsonGetNumberByKeyAfter = ParseNumber(numStr)
    Exit Function

Fail:
    JsonGetNumberByKeyAfter = Null
End Function

' *** String associada a "key": (primeira ocorrencia) ***
Public Function JsonGetStringByKey(json As String, key As String) As Variant
    Dim keyPos As Long
    Dim colonPos As Long
    Dim firstQuote As Long
    Dim secondQuote As Long

    On Error GoTo Fail

    keyPos = InStr(1, json, """" & key & """", vbTextCompare)
    If keyPos = 0 Then GoTo Fail

    colonPos = InStr(keyPos + Len(key) + 2, json, ":")
    If colonPos = 0 Then GoTo Fail

    firstQuote = InStr(colonPos, json, """")
    If firstQuote = 0 Then GoTo Fail

    secondQuote = InStr(firstQuote + 1, json, """")
    If secondQuote = 0 Then GoTo Fail

    JsonGetStringByKey = Mid(json, firstQuote + 1, secondQuote - firstQuote - 1)
    Exit Function

Fail:
    JsonGetStringByKey = Null
End Function

' *** HELPER: converter string numerica (ponto decimal) para Double ***
Private Function ParseNumber(numStr As String) As Variant
    Dim cleaned As String
    cleaned = Trim(numStr)

    On Error GoTo Fail

    ' JSON usa ponto como separador decimal; Val() ignora locale
    ParseNumber = Val(cleaned)
    Exit Function

Fail:
    ParseNumber = Null
End Function

' *** HELPER: verificar se a resposta contem uma chave ***
Public Function JsonHasKey(json As String, key As String) As Boolean
    JsonHasKey = (InStr(1, json, """" & key & """", vbTextCompare) > 0)
End Function
